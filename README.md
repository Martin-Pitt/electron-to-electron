# Electron to Electron

Electron module that enables cross-app communication in a local network.
Auto-discovery via UDP broadcasting for zero config networking.

# Usage

```
const Communications = require('./lib/Communications')({
	service: Package.name, // Name that other services can identify this by
	onlyToSameServices: true // Limit remote communications to services with the same name
});
const Locally = Communications.locally;
const Discovery = Communications.discovery;
const Remotely = Communications.remotely;
```


## Locally
Locally is a light layer ontop of normal Electron IPC.
It features broadcasting to all renderer processes via `.send('type', { foo: 'bar' })` method.

```
Locally.on('my-custom-event', (arg1, arg2, arg3, etc) => {
	// code
});

Locally.send('my-other-custom-event', { foo: 'bar' });
```


## Remotely
Remotely has an EventEmitter API signature. (`.on('type', callback)`, `.send('type', { foo: 'bar' })`, etc.)
This is for remote communications with external applications. Sending events and adding event listeners.
```
Remotely.on('external-event', (arg) => {
	if(arg.foo) console.log(arg.foo);
});

Remotely.send('another-external-event', { foo: 'bar' });
```


## Discovery
Discovery has some lifecycle events:
```
Discovery.on('found', event => {
	const service = event.client;
	console.log(`[Discovery] Found ${service.name} (${service.id.slice(0, 4)}…) @ ${service.address}`);
});

Discovery.on('lost', event => {
	const service = event.client;
	console.log(`[Discovery] Lost ${service.name} (${service.id.slice(0, 4)}…) @ ${service.address}`);
});

Discovery.on('updated', event => {
	Locally.send('got-some-new-clients', event.clients);
});

Locally.on('marco', () => {
	Locally.send('uhoh-lost-some-clients', Discovery.clients);
});
```

## Communications
A high level command is available to set direct twoway communication for events between external applications and the renderer process for particular types of events:
```
Communications.twoway([
	'touch.select',
	'touch.reload',
	'video.meta'
]);
```
Any of these events that are received from other electron apps will be passed immediately via IPC to all open renderer processes.
Vice versa, any of these events that are received from a renderer process is passed to external applications.
