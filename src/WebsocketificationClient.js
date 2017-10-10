/**
 * Created by fisher at 7:05 PM on 3/23/17.
 */

'use strict';

const WS_STATUS_CONNECTING = 'CONNECTING';
const WS_STATUS_CONNECTED = 'CONNECTED';
const WS_STATUS_DISCONNECTED = 'DISCONNECTED';
const WS_STATUS_ERROR = 'ERROR';

const METHOD_DEFAULT = 'GET';

class WebsocketificationClient {
	constructor(address) {
		[
			'connect', 'close',
			'onResponse',
			'fetch',
			'setOnBroadcastListener', 'setOnUnhandledResponseListener',
			'setOnClosedListener', 'setOnErrorListener'
		].map(method => this[method] = this[method].bind(this));
		this.fetch = this.fetch.bind(this);
		this.mStatus = WS_STATUS_CONNECTING;
		this.mAddress = address;
		/**
		 * Temp listener that will be triggered only for once.
		 */
		this.mTempListeners = [];
		/**
		 * Global listener that will be triggered more than once.
		 */
		this.mGlobalListeners = [];
		/**
		 * Unhandled listener that will be called for unhandled response.
		 */
		this.mUnhandledListener = undefined;
	}

	connect() {
		this.mWS = new WebSocket(this.mAddress);
		this.mWS.onmessage = message => {
			this.onResponse(JSON.parse(message.data));
		};
		return new Promise((resolve, reject) => {
			this.mWS.onopen = () => {
				this.mStatus = WS_STATUS_CONNECTED;
				resolve();
			};
			this.mWS.onerror = error => {
				this.mStatus = WS_STATUS_ERROR;
				if (this.mOnError) {this.mOnError(error);}
				reject();
			};
			this.mWS.onclose = () => {
				this.mStatus = WS_STATUS_DISCONNECTED;
				if (this.mOnClose) {this.mOnClose();}
				reject();
			};
		})
	}

	/**
	 * Close connection.
	 */
	close() {
		this.mWS.close();
	}

	/**
	 * Handle response.
	 */
	onResponse(response) {
		if (!response || !response.id || !response.status) {return;}
		response.json = () => response.body;
		let listener = this.mTempListeners[response.id];
		if (listener) {
			delete this.mTempListeners[response.id];
			if (200 === response.status) {
				listener.resolve(response);
			} else {
				listener.reject(response);
			}
			return;
		}
		listener = this.mGlobalListeners[response.id];
		if (listener) {
			if (200 === response.status) {
				listener(null, response);
			} else {
				listener(response);
			}
			return;
		}
		if (this.mUnhandledListener) {
			this.mUnhandledListener(response);
		}
	}

	/**
	 * Fetch resources like HTTP request.
	 *
	 * @param path Resource path.
	 * @param options
	 * @returns {Promise}
	 */
	fetch(path, options = {}) {
		options.path = path;
		options.id = `http$${Math.random()}@${+new Date()}`;
		if (!options.method) {options.method = METHOD_DEFAULT;}
		return new Promise((resolve, reject) => {
			let time = 100;
			let checkConnection = () => {
				switch (this.mStatus) {
					case WS_STATUS_CONNECTING:
						setTimeout(() => {
							checkConnection();
						}, time);
						// Slow down the loop.
						time += 20;
						break;
					case WS_STATUS_CONNECTED:
						this.mWS.send(JSON.stringify(options));
						// Set listener.
						this.mTempListeners[options.id] = {resolve, reject};
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

	/**
	 * Set on broadcast listener.
	 *
	 * @param id{String} Broadcast id, which is usually a path.
	 * @param callback{Function} Callback.
	 */
	setOnBroadcastListener(id, callback) {
		this.mGlobalListeners[id] = callback;
	}

	/**
	 * Set unhandled listener.
	 * @param callback{Function} Callback.
	 */
	setOnUnhandledResponseListener(callback) {
		this.mUnhandledListener = callback;
	}

	/**
	 * Set on closed listener.
	 *
	 * Pass null to remove listener.
	 * @param callback Callback.
	 */
	setOnClosedListener(callback) {
		this.mOnClose = callback;
	}

	/**
	 * Set on error listener.
	 *
	 * Pass null to remove listener.
	 * @param callback Callback.
	 */
	setOnErrorListener(callback) {
		this.mOnError = callback;
	}
}

module.exports = WebsocketificationClient;
