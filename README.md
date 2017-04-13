# Websocketification Client

<!-- > Created by Fisher at 20:44 on 2017-04-13. -->

Websocketification Client in the [`fetch`][github-fetch] way with the help of [`WebpackJs`][webpack-js-org].

## TODO

- [ ] Tests.
- [ ] Docs.
- [ ] Connection Retry.

## Installation

```
npm install --save websocketification-client
```

## Browser-Side Usage

Integrate `websocketification-client` in the following way and pack it with `WebpackJs` before execute it in the browser.


```js
const WebsocketificationClient = require('websocketification-client');
const client = new WebsocketificationClient('ws://127.0.0.1:3123/');
client.connect();
const fetch = client.fetch;

let options = {
	method: 'POST',
	credentials: 'include',
	headers: {'Content-Type': 'application/json'},
	body: {name: 'Tom'}
};

return fetch('/users', options).then(
	response => response.json()
).then(response => {
	console.log('Got users: ', response);
}).catch(error => {
	console.error('Failed to get users: ', error);
});
```

## Server/NodeJs Side Usage

To run in the server, use [`ws`][github-ws] as the `global.WebSocket` Object.

@see [`./examples/get-started.js`](examples/get-started.js).

```js
if ('undefined' === typeof(window) && !global.WebSocket) {
	global.WebSocket = require('ws');
}

// ...
```


[webpack-js-org]: https://webpack.js.org "WebPack Js"
[github-fetch]: https://github.com/github/fetch "Github: fetch"
[github-ws]: https://github.com/websockets/ws "Github: ws"

