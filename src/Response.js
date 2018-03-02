'use strict';

// @see https://developer.mozilla.org/en-US/docs/Web/API/Response
// The wstf.response which is alike with fetch.response
class Response {
	constructor() {

	}

	json() {
		return this.body;
	}

	isSuccess() {
		return this.status >= 200 && this.status < 300 || this.status === 304;
	}

	isValid() {
		return this.id && this.status;
	}
}

Response.NewInstance = (jsonString) => {
	try {
		const response = JSON.parse(jsonString);
		Object.setPrototypeOf(response, Response.prototype);
		return response;
	} catch (ex) {
		// Ignore the exception.
	}
};

module.exports = Response;