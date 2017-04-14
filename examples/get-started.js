/**
 * Created by fisher at 8:46 PM on 4/13/17.
 */

'use strict';

if ('undefined' === typeof(window) && !global.WebSocket) {
	global.WebSocket = require('ws');
}

const WebsocketificationClient = require('./../');
const client = new WebsocketificationClient('ws://127.0.0.1:3123/');
client.connect();
const fetch = client.fetch;

let options = {
	method: 'POST',
	credentials: 'include',
	headers: {'Content-Type': 'application/json'},
	body: {name: 'Tom'}
};

fetch('/users', options).then(
	response => response.json()
).then(response => {
	console.log('Got users: ', response);
}).catch(error => {
	console.error('Failed to get users: ', error);
});

/**
 * Add on broadcast listener.
 */
client.setOnBroadcastListener('app.messages', (error, message) => {
	if (error) {return console.error(error);}
	console.log(message);
});

