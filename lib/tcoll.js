var safe = require('safe');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var async = require('async');

function tcoll() {
	var self = this;
	this._tdb = null;
	this._name = null;
	this._store = {};
	this._fd = null;
	this._fsize = null;
	this._wqueue = new async.queue(function (task,cb) {
		var item = task.item;
		var id = task.id;
		var kitem = {"id":item.id};
		var sobj = JSON.stringify(item);
		var skey = JSON.stringify(kitem);
		var zeros = "0000000000";
		var lobj = sobj.length.toString();
		var lkey = skey.length.toString();
		lobj = zeros.substr(0,zeros.length - lobj.length)+lobj;
		lkey = zeros.substr(0,zeros.length - lkey.length)+lkey;
		var h1={k:lkey,o:lobj,v:"001"};
		var buf = new Buffer(JSON.stringify(h1)+"\n"+skey+"\n"+sobj+"\n");
		
		fs.write(self._fd,buf, 0, buf.length, self._fsize, safe.sure( cb, function (written) {
			self._store[id]=self._fsize;
			self._fsize+=written;
			cb(null);		
		}))
	},1);
}

module.exports = tcoll;

tcoll.prototype.init = function (tdb, name, options, cb) {
	var self= this;
	this._tdb = tdb;
	this._name = name;
	var pos = 0;
	fs.open(path.join(this._tdb._path,this._name), "a+", safe.sure(cb, function (fd) {
		self._fd = fd;
		var b1 = new Buffer(45);
		async.whilst(function () { return self._fsize==null; }, function(cb) {
			fs.read(fd, b1, 0, 45, pos, safe.sure(cb, function (bytes, data) {
				if (bytes==0) {
					self._fsize = pos;
					return cb();
				}
				var h1 = JSON.parse(data.toString());
				h1.o = parseInt(h1.o,10);
				h1.k = parseInt(h1.k,10);
				var b2 = new Buffer(h1.k);
				fs.read(fd,b2,0,h1.k,pos+45+1, safe.sure(cb, function (bytes, data) {
					var obj = JSON.parse(data.toString());
					self._store[obj.id]=pos;
					pos+=45+3+h1.o+h1.k;
					cb();
				}))
			}))
		}, cb)
	}));
}

tcoll.prototype.addIndex = function () {
	console.log(arguments);
	_(arguments).last()(null);
}

tcoll.prototype.get = function (id, cb) {
	var self = this;
	var pos = this._store[id]; 
	if (pos == null) return cb(null,null);
	var b1 = new Buffer(45);
	fs.read(self._fd, b1, 0, 45, pos, safe.sure(cb, function (bytes, data) {
		var h1 = JSON.parse(data.toString());
		h1.o = parseInt(h1.o,10);
		h1.k = parseInt(h1.k,10);
		var b2 = new Buffer(h1.o);
		fs.read(self._fd,b2,0,h1.o,pos+45+2+h1.k, safe.sure(cb, function (bytes, data) {
			var obj = JSON.parse(data.toString());
			cb(null,obj);
		}))
	}))
}

tcoll.prototype.scan = function (worker) {
	worker(null, null, null)
}

tcoll.prototype.put = function (id, item, cb) {
	this._wqueue.push({id:id,item:item},cb);
}

tcoll.prototype.size = function (cb) {
	cb(null, _.size(this._store));
}