'use strict';

// @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
// @see https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications

const Response = require('./Response');

// Defined commands.
const CMD_PREFIX = '$';
const CMD_PING = '$PING';
const CMD_PONG = '$PING';

const JSON_OBJECT_PREFIX = '{';

const METHOD_DEFAULT = 'GET';

class WebsocketificationClient {
	constructor(address, options = {
		enableLogging: true,
		// Heartbeat interval in milliseconds, default: send '$PING' every 50 seconds.
		heartbeatInterval: 50000,
		retryWaitingTimeStart: 0,
		retryWaitingTimeStep: 150,
	}) {
		[
			'connect', 'close',
			'onResponse',
			'fetch',
			'setOnBroadcastListener', 'setOnUnhandledResponseListener',
			'setOnClosedListener', 'setOnErrorListener'
		].map(method => this[method] = this[method].bind(this));
		this.fetch = this.fetch.bind(this);
		// Whether the socket is closed nicely, if the socket is closed or closing.
		this.mIsNicelyClosed = true;
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
		this.mEnableLogging = options.enableLogging;
		if (this.mEnableLogging) {
			// The default WebSocket.onerror event listener.
			this.mOnError = (event) => console.error('WebSocket onerror callback triggered: ws.onerror(event)->', event);
			// The default WebSocket.onclose event listener.
			this.mOnClose = null;
		}

		// Configure for heartbeat package.
		this.mHeartbeatInterval = options.heartbeatInterval;

		// Waiting time for retry.
		this.mRetryWaitingTimeStart = options.retryWaitingTimeStart;
		this.mRetryWaitingTimeStep = options.retryWaitingTimeStep;
		this.mRetryWaitingTime = this.mRetryWaitingTimeStart;
		// Waiting time for CONNECTING => CONNECTED.
		this.mRequestWaitingTimeStart = 100;
		this.mRequestWaitingTimeStep = 20;
	}

	log(...args) {
		if (this.mEnableLogging) {
			console.log(...args);
		}
	}

	connect() {
		return new Promise((resolve, reject) => {
			try {
				this.mWS = new WebSocket(this.mAddress);
			} catch (ex) {
				reject(ex, 'Invalid address: ' + address);
				return
			}
			const ws = this.mWS;
			this.log(`Connecting to ${ws.url}.`);
			ws.onmessage = (message) => {
				// Skip if any internal command is received.
				if (message.data.startsWith(CMD_PREFIX)) {
					switch (message.data) {
						case CMD_PING:
							ws.send(CMD_PONG);
							break;
						case CMD_PONG:
							break;
					}
					return;
				}
				// Skip if, obviously, not an json object is received.
				if (!message.data.startsWith(JSON_OBJECT_PREFIX)) {
					return;
				}
				const response = Response.NewInstance(message.data);
				if (!response) {
					this.log('Unexpected response data:', message.data);
					return;
				}
				if (!response.isValid()) {
					this.log('Invalid response(fields of id and status are required):', response);
					return;
				}
				this.onResponse(response);
			};
			ws.onopen = (event) => {
				this.log(`Connected to ${ws.url}.`);

				// Ping in intervals.
				const pingLoop = () => {
					setTimeout(() => {
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(CMD_PING);
							pingLoop();
						}
					}, this.mHeartbeatInterval);
				};
				pingLoop();

				// Reset the retry waiting time.
				this.mRetryWaitingTime = this.mRetryWaitingTimeStart;
				resolve(event);
			};
			ws.onerror = (event) => {
				if (this.mOnError) {
					this.mOnError(event);
				}
				reject(event);
			};
			ws.onclose = (event) => {
				if (event.wasClean) {
					// Connection is elegantly closed.
					this.mIsNicelyClosed = true;
				} else {
					this.mIsNicelyClosed = false;
					this.log(`WebSocket closed and waiting for ${this.mRetryWaitingTime} milliseconds before start a new connection.`);
					// Retry connection.
					setTimeout(() => {
						this.connect();
						this.mRetryWaitingTime += this.mRetryWaitingTimeStep;
					}, this.mRetryWaitingTime);
				}
				if (this.mOnClose) {
					this.mOnClose(event);
				}
				reject(event);
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
		let listener = this.mTempListeners[response.id];
		if (listener) {
			delete this.mTempListeners[response.id];
			if (response.isSuccess()) {
				listener.resolve(response);
			} else {
				listener.reject(response);
			}
			return;
		}
		listener = this.mGlobalListeners[response.id];
		if (listener) {
			if (response.isSuccess()) {
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
		if (!options.method) {
			options.method = METHOD_DEFAULT;
		}
		return new Promise((resolve, reject) => {
			let time = this.mRequestWaitingTimeStart;
			let checkConnection = () => {
				switch (this.mWS.readyState) {
					case WebSocket.CONNECTING:
						setTimeout(() => {
							checkConnection();
						}, time);
						// Slow down the loop.
						time += this.mRequestWaitingTimeStep;
						break;
					case WebSocket.OPEN:
						this.mWS.send(JSON.stringify(options));
						// Set listener.
						this.mTempListeners[options.id] = {resolve, reject};
						break;
					case WebSocket.CLOSING:
					case WebSocket.CLOSED:
						if (this.mIsNicelyClosed) {
							// Reconnect now if the WebSocket is closed normally.
							this.connect().then(() => {
								if (this.mWS.readyState !== WebSocket.OPEN) {
									// This is not going to happen.
									throw new Error('WebSocket should be open: ' + WebSocket.readyState);
								}
								this.mWS.send(JSON.stringify(options));
								// Set listener.
								this.mTempListeners[options.id] = {resolve, reject};
							}).catch((ex) => {
								reject(ex);
							});
						} else {
							// Reject error immediately if the WebSocket is closed abnormally.
							reject(new Error('WebSocket is closed abnormally and is trying to reconnect:' + this.mWS.readyState));
						}
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
