const EventEmitter = require('events');
const electron = require('electron');
const address = require('address');
const Netmask = require('netmask').Netmask;
const http = require('http');
const firstOpenPort = require('first-open-port');
const got = require('got');
const Polo = require('polo');



/// Distributed event emitter that can announce itself via zero-config service discovery across a local network
class Communications {
	constructor(options) {
		this.state = 'idle';
		this.options = options = Object.assign({
			service: null, // Name to announce to other services as
			namespace: false, // (String or Null)  Filter remote events by namespace (Unimplemented)
			onlyToSameServices: false // (Boolean)  Limit remote communications only to services with same name
		}, options);
		
		this.service = {
			id: Math.random().toString(16).substr(2),
			name: options.service || 'anonymous',
			port: null
		};
		
		this.locally = new Locally();
		this.discovery = new Discovery(this);
		this.remotely = new Remotely(this);
	}
	
	start() {
		this.state = 'starting';
		return this.remotely.start()
		.then(() => this.discovery.start())
		.then(() => this.state = 'ready');
	}
	
	twoway(events) {
		events.forEach(type => {
			this.locally.on(type, event => this.remotely.send(type, event));
			this.remotely.on(type, event => this.locally.send(type, event));
		});
	}
}



/// Inter Process Communication
class Locally {
	constructor() {
		this.ipc = electron.ipcMain;
		this.webContents = electron.webContents;
	}
	
	send(type, event) {
		this.webContents.getAllWebContents().forEach(webContent => webContent.send(type, event));
	}
	
	on(type, callback) {
		this.ipc.on(type, (event, ...args) => {
			event.returnValue = callback.apply(null, args);
		});
	}
}


/// Announces self and discovers other services using UDP broadcasting
class Discovery extends EventEmitter {
	constructor(comms) {
		super();
		this.comms = comms;
		this.broadcastAddress = null;
		this.polo = null;
		this.clients = [];
		this.handleUp = this.handleUp.bind(this);
		this.handleDown = this.handleDown.bind(this);
	}
	
	start() {
		return new Promise((resolve, reject) => {
			const networkInterface = address.interface('IPv4');
			if(!networkInterface) return reject({ type: 'no-interface' });
			
			const block = new Netmask(networkInterface.address, networkInterface.netmask);
			this.broadcastAddress = block.broadcast;
			
			const polo = this.polo = Polo({
				multicast: this.broadcastAddress,
				heartbeat: 5*1000
			});
			polo.on('up', this.handleUp);
			polo.on('down', this.handleDown);
			polo.put(this.comms.service);
			
			resolve();
		});
	}
	
	handleUp(name, marco) {
		const Service = this.comms.service;
		
		if(marco.id === Service.id) return;
		
		this.clients.push(marco);
		this.emit('found', { clients: this.clients, client: marco });
		this.emit('updated', { clients: this.clients });
	}
	
	handleDown(name, marco) {
		const Service = this.comms.service;
		
		if(marco.id === Service.id) return;
		const index = this.clients.findIndex(client => client === marco);
		if(index === -1) return;
		
		this.clients.splice(index);
		this.emit('lost', { clients: this.clients, client: marco });
		this.emit('updated', { clients: this.clients, client: marco });
	}
}


/// Handles external/remote communications to other applications/services
class Remotely extends EventEmitter {
	constructor(comms) {
		super();
		this.comms = comms;
		this.server = http.createServer();
		this.handleRequest = this.handleRequest.bind(this);
		this.server.on('request', this.handleRequest);
	}
	
	start() {
		const Service = this.comms.service;
		return new Promise((resolve, reject) => {
			firstOpenPort(20000).then(port => {
				Service.port = port;
				this.server.listen(port, resolve);
			});
		});
	}
	
	handleRequest(req, res) {
		if(!req.url.startsWith('/event/')) return;
		const type = req.url.split('/')[2];
		if(!type) return;
		const mime = req.headers['content-type'];
		
		let body = '';
		req.on('data', chunk => body += chunk.toString());
    	req.on('end', () => {
			res.writeHead(200, 'OK', { 'Content-Type': 'text/plain' });
			res.end();
			
			if(mime === 'text/plain'); // Let it be
			else if(mime === 'application/json') body = JSON.parse(body);
			else; // Unhandled Content-Type!
			
			this.emit(type, body);
	    });
	}
	
	send(type, event) {
		const Service = this.comms.service;
		let clients = this.comms.discovery.clients;
		
		if(this.comms.options.onlyToSameServices)
		{
			clients = clients.filter(client => client.name === Service.name);
		}
		
		clients.forEach(client => {
			let request = {
				host: client.host,
				port: client.port,
				path: '/event/' + type,
				method: 'PUT',
				headers: {},
				body: null,
				json: true
			};
			
			if(typeof event === 'object')
			{
				request.headers['content-type'] = 'application/json';
				request.body = JSON.stringify(event);
			}
			
			else if(typeof event === 'string')
			{
				request.headers['content-type'] = 'text/plain';
				request.body = event;
			}
			
			got(request);
		});
	}
}


module.exports = function(options) {
	return new Communications(options);
}
