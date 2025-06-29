require('dotenv').config()
const toml = require('toml');
const fs = require('fs');
const { createClient } = require('@1password/sdk');
const crypto = require('crypto');
const {loopWhile} = require('deasync')
const path = require('path');
const Nunjucks = require('nunjucks');

class Config {
	static #staticCache = null;
	#cache = null;
	#loadingPromise = null;
	#nunjucks = null;

	constructor (vars = {}, opts = {}) {
		this.vars = vars;
		this.opts = opts;
		Nunjucks.installJinjaCompat();
		this.#nunjucks = Nunjucks.configure('views', {
			async: true,
		});
	}

	static readSync (vars = {}, opts) {
		if (Config.#staticCache) return JSON.parse(JSON.stringify(Config.#staticCache));
		var data = null;
		Config.read(vars, opts).then((d) => {
			data = d;
		}).catch((e) => {
			console.error('[CONFIG] Error reading config:', e);
			data = e;
		});
		loopWhile(() => data === null, 10);
		if (data instanceof Error) throw data;
		return data;
	}

	static async read (vars = {}, opts = {}) {
		if (Config.#staticCache) return JSON.parse(JSON.stringify(Config.#staticCache));
		const instance = new Config(vars, opts);
		return await instance.read()
	};

	async read (vars = {}, opts = {}) {
		const st = Date.now()

		if (!process.env.OP_CACHE_IV) {
			const msg = `[CONFIG] env.OP_CACHE_IV environment variable is not set, here is a new IV: OP_CACHE_IV=${crypto.randomBytes(16).toString('hex')}`;
			throw new Error(msg);
		}

		if (!process.env.OP_SERVICE_ACCOUNT_TOKEN) {
			throw new Error('[CONFIG] env.OP_SERVICE_ACCOUNT_TOKEN environment variable is not set.');
		}

		let result = null;
		// Add a race here with a 10 second timeout warning
		// Add a 30 second timeout to the promise
		setTimeout(() => {
			if (!result) console.warn('[CONFIG] Config read is taking too long, this may indicate a problem with the 1Password connection or config file');
		}, 10000);

		result = await new Promise((resolve, reject) => {
			if (!this.#loadingPromise) this.#loadingPromise = this.readWrapped(vars, opts);
			setTimeout(() => {
				reject(new Error('[CONFIG] Config read timed out after 30 seconds'));
			}, 30000);

			this.#loadingPromise.then(resolve).catch(reject);
		});
		console.log(`[CONFIG] Config read took ${Date.now() - st}ms`);

		const config = await this.processTemplate(result, vars)
		return toml.parse(config);
	}

	async readWrapped (opts = {}) {
		if (this.#loadingPromise) return await this.#loadingPromise;

		const standardConfigFilename = path.resolve(process.cwd(), opts.defaultConfigFile || './config.toml');
		const cacheFileName = path.resolve(process.cwd(), opts.defaultCacheFile || './config.cache');
		const packageJsonFilename = path.resolve(process.cwd(), './package.json');

		let encryptedData = null;
		let salt = crypto.randomBytes(16).toString('hex');
		try {
			this.#cache = '' + fs.readFileSync(standardConfigFilename);
			console.log(`[CONFIG] ${standardConfigFilename} found, using it`);
			return this.#cache;
		} catch (e) {
			console.debug(`[CONFIG] ${standardConfigFilename} not found`);
		}

		if (!process.env.OP_CONFIG_PATH) {
			const msg = `[CONFIG] env.OP_CONFIG_PATH environment variable is not set, OP_CONFIG_PATH=ops://<vault-name>/<item-name>/<field-name>`;
			throw new Error(msg);
		}
		
		try {
			const encryptedFileContents = await fs.promises.readFile(cacheFileName, 'utf8');
			if (encryptedFileContents) [encryptedData, salt] = encryptedFileContents.split(':');
		} catch (e) {
			console.debug(`[CONFIG] ${cacheFileName} not found`);
		}
		let key = crypto.scryptSync(process.env.OP_SERVICE_ACCOUNT_TOKEN, salt, 32);

		setTimeout(() => {
			fs.promises.unlink(cacheFileName).catch((e) => {});
		}, process.env.OP_CONFIG_CACHE * 1000);
		if (encryptedData) {
			try {
				this.#cache = this.decrypt(encryptedData.toString('utf8'), key);
				console.log('[CONFIG] encrypted config cache found, using it');
				return this.#cache;
			} catch (e) {
				console.debug('[CONFIG] ERROR Reading encrypted contents', e);
			}
		}
		const packageJson = require(packageJsonFilename);

		const client = await createClient({
			auth: process.env.OP_SERVICE_ACCOUNT_TOKEN,
			integrationName: packageJson.name,
			integrationVersion: "v" + packageJson.version,
		});
		console.debug(`[CONFIG] Fetching: ${process.env.OP_CONFIG_PATH}`)
		const configRaw = await client.secrets.resolve(process.env.OP_CONFIG_PATH);
		if (process.env.OP_CONFIG_CACHE) {
			console.debug(`[CONFIG] Caching config to ${cacheFileName} for ${process.env.OP_CONFIG_CACHE} seconds`);
			fs.promises.writeFile(cacheFileName, this.encrypt(configRaw, key) + ':' + salt, 'utf8');
		}
		this.#cache = configRaw;
		return configRaw;
	}

	async processTemplate (template, vars) {
		this.#nunjucks.addGlobal('op', async function(path, callback) {
			try {
				const result = await client.secrets.resolve(process.env.OP_CONFIG_PATH);
				callback(null, result);
			} catch (e) {
				callback(e);
			}
		});
		return new Promise((resolve, reject) => {
			this.#nunjucks.renderString(template, vars, (err, res) => {
				if (err) return reject(err);
				resolve(res);
			});
		});
	}

	encrypt (text, key) {
		const IV = Buffer.from(process.env.OP_CACHE_IV, 'hex');
		// Generate a random initialization vector

		// Create cipher with AES-256-CBC
		const cipher = crypto.createCipheriv('aes-256-cbc', key, IV);

		// Encrypt the data
		let encrypted = cipher.update(text, 'utf8', 'hex');
		encrypted += cipher.final('hex');

		// Return both the encrypted data and the IV
		return encrypted
	}

	// Function to decrypt data
	decrypt (encryptedData,  key) {
		const IV = Buffer.from(process.env.OP_CACHE_IV, 'hex');
		// Create decipher
		const decipher = crypto.createDecipheriv('aes-256-cbc', key, IV	);

		// Decrypt the data
		let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	}
}

module.exports = Config;