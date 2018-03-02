'use strict';

// @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
// @see https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications

const Response = require('./Response');

// Defined commands.
const CMD_PREFIX = '$';
const CMD_PING = '$PING';
const CMD_PONG = '$PONG';

const JSON_OBJECT_PREFIX = '{';

const METHOD_DEFAULT = 'GET';

class WebsocketificationClient {
	constructor(address, {
		enableLogging = true,
		// Heartbeat interval in milliseconds, default: send '$PING' every 50 seconds.
		heartbeatInterval = 50000,
		retryWaitingTimeStart = 0,
		retryWaitingTimeStep = 230,
		// Disconnect after milliseconds with no activities.
		// Default value is 35 minutes, and set to 0 to disable auto disconnection.
		autoDisconnectAfter = 35 * 60000,
	} = {}) {
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
		this.mEnableLogging = enableLogging;
		if (this.mEnableLogging) {
			// The default WebSocket.onerror event listener.
			this.mOnError = (event) => console.error('WebSocket onerror callback triggered: ws.onerror(event)->', event);
			// The default WebSocket.onclose event listener.
			this.mOnClose = null;
		}

		// Configure for heartbeat package.
		this.mHeartbeatInterval = heartbeatInterval;

		// Waiting time for retry.
		this.mRetryWaitingTimeStart = retryWaitingTimeStart;
		this.mRetryWaitingTimeStep = retryWaitingTimeStep;
		this.mRetryWaitingTime = this.mRetryWaitingTimeStart;

		// Auto disconnection policy.
		this.mAutoDisconnectAfter = autoDisconnectAfter;
		this.mAutoDisconnectionTimeoutHandler = null;

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
				// Skip if, obviously, not an json object is received.
				if (!message.data.startsWith(JSON_OBJECT_PREFIX)) {
					this.handleNoneRequestMessage(message);
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

				this.resetDisconnectionTimeout();

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
					this.log(`WebSocket disconnected nicely, by client or server.`);
				} else {
					this.mIsNicelyClosed = false;
					this.autoConnectOnAbnormalClose();
				}
				if (this.mOnClose) {
					this.mOnClose(event);
				}
				reject(event);
			};
		})
	}

	handleNoneRequestMessage(message) {
		// Skip if any internal command is received.
		if (message.data.startsWith(CMD_PREFIX)) {
			switch (message.data) {
				case CMD_PING:
					this.mWS.send(CMD_PONG);
					break;
				case CMD_PONG:
					break;
			}
		}
	}

	// Reconnect called on abnormal close,
	autoConnectOnAbnormalClose() {
		if (this.mRetryWaitingTime + this.mRetryWaitingTimeStep <= 0) {return;}
		this.log(`WebSocket disconnected abnormally and waiting for ${this.mRetryWaitingTime} milliseconds before start a new connection.`);
		// Retry connection.
		setTimeout(() => {
			this.connect();
			this.mRetryWaitingTime += this.mRetryWaitingTimeStep;
		}, this.mRetryWaitingTime);
	}

	// Update auto disconnection timeout handler, will be called every time when after ws.onopen(), and before ws.send().
	resetDisconnectionTimeout() {
		if (this.mAutoDisconnectAfter <= 0) {return;}
		if (this.mAutoDisconnectionTimeoutHandler) {clearTimeout(this.mAutoDisconnectionTimeoutHandler)}
		this.mAutoDisconnectionTimeoutHandler = setTimeout(() => {
			if (this.mWS.readyState === WebSocket.OPEN) {this.mWS.close(1000);}
		}, this.mAutoDisconnectAfter);
	}

	/**
	 * Close connection.
	 */
	close(code = 1000, reason) {
		this.mWS.close(code, reason);
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
		this.resetDisconnectionTimeout();
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
