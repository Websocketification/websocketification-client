/**
 * Created by fisher at 7:05 PM on 3/23/17.
 */

'use strict';

const WS_STATUS_CONNECTING = 'CONNECTING';
const WS_STATUS_CONNECTED = 'CONNECTED';
const WS_STATUS_DISCONNECTED = 'DISCONNECTED';
const WS_STATUS_ERROR = 'ERROR';

class WebsocketificationClient {
	constructor(address) {
		['connect', 'onResponse', 'onError', 'onClose', 'fetch', 'close'].map(method => this[method] = this[method].bind(this));
		this.fetch = this.fetch.bind(this);
		this.mStatus = WS_STATUS_CONNECTING;
		this.mAddress = address;
		/**
		 * Temp listener that will be triggered only for once.
		 */
		this.mTempListeners = [];
		/**
		 * Temp listener that will be triggered only for once.
		 */
		this.mGlobalListeners = [];
	}

	connect() {
		this.mWS = new WebSocket(this.mAddress);
		this.mWS.onmessage = message => {
			this.onResponse(JSON.parse(message.data));
		};
		return new Promise((resolve, reject) => {
			let called = false;
			this.mWS.onopen = () => {
				this.mStatus = WS_STATUS_CONNECTED;
				if (!called) {
					called = true;
					resolve();
				}
			};
			this.mWS.onerror = error => {
				this.mStatus = WS_STATUS_ERROR;
				this.onError(error);
				if (!called) {
					called = true;
					reject();
				}
			};
			this.mWS.onclose = error => {
				this.mStatus = WS_STATUS_DISCONNECTED;
				this.onClose(error);
				if (!called) {
					called = true;
					reject();
				}
			};
		})
	}

	/**
	 * Handle response.
	 */
	onResponse(response) {
		if (!response || !response.method || !response.status) {return}
		response.json = () => response.body;
		const key = `${response.method || 'GET'}:${response.path}`;
		let listener = this.mTempListeners[key];
		if (listener) {
			delete this.mTempListeners[key];
			if (200 === response.status) {
				listener.resolve(response);
			} else {
				listener.reject(response);
			}
			return;
		}
		listener = this.mGlobalListeners[key];
		if (listener) {
			if (200 === response.status) {
				listener.resolve(response);
			} else {
				listener.reject(response);
			}
			return;
		}
		console.warn('UNHANDLED RESPONSE: ', key, response);
	}

	onError(error) {
		console.log('ERROR: ', error);
	}

	onClose() {
		// TODO ADD RETRY ON DISCONNECTED.
		console.log('Connection Closed.');
	}

	/**
	 * Fetch resources.
	 *
	 * @param path Resource path.
	 * @param options
	 * @returns {Promise}
	 */
	fetch(path, options = {}) {
		options.path = path;
		if (!options.method) {options.method = 'GET';}
		return new Promise((resolve, reject) => {
			let checkConnection = () => {
				switch (this.mStatus) {
					case WS_STATUS_CONNECTING:
						console.log('Waiting for WebSocket connection!');
						setTimeout(() => {
							checkConnection();
						}, 100);
						break;
					case WS_STATUS_CONNECTED:
						this.mWS.send(JSON.stringify(options));
						// Default send 'GET' request.
						// Set listener.
						this.mTempListeners[`${options.method}:${options.path}`] = {resolve, reject};
						break;
					case WS_STATUS_DISCONNECTED:
					case WS_STATUS_ERROR:
						reject(new Error('WebSocket ' + this.mStatus));
						break;
				}
			};
			checkConnection();
		});
	}

	close() {
		this.mWS.close();
	}
}

module.exports = WebsocketificationClient;
