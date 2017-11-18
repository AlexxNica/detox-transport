// Generated by LiveScript 1.5.0
/**
 * @package   Detox transport
 * @author    Nazar Mokrynskyi <nazar@mokrynskyi.com>
 * @copyright Copyright (c) 2017, Nazar Mokrynskyi
 * @license   MIT License, see license.txt
 */
(function(){
  var COMMAND_DHT, COMMAND_DATA, COMMAND_TAG, COMMAND_UNTAG;
  COMMAND_DHT = 0;
  COMMAND_DATA = 1;
  COMMAND_TAG = 2;
  COMMAND_UNTAG = 3;
  /**
   * @param {!Uint8Array} array
   *
   * @return {string}
   */
  function array2hex(array){
    var string, i$, len$, byte;
    string = '';
    for (i$ = 0, len$ = array.length; i$ < len$; ++i$) {
      byte = array[i$];
      string += byte.toString(16).padStart(2, 0);
    }
    return string;
  }
  /**
   * @param {string} string
   *
   * @return {!Uint8Array}
   */
  function hex2array(string){
    var array, i$, to$, i;
    array = new Uint8Array(string.length / 2);
    for (i$ = 0, to$ = array.length; i$ < to$; ++i$) {
      i = i$;
      array[i] = parseInt(string.substring(i * 2, i * 2 + 2), 16);
    }
    return array;
  }
  function Transport(webtorrentDht, ronion, jssha, asyncEventer){
    var webrtcSocket, simplePeer, x$, y$;
    webrtcSocket = webtorrentDht({
      bootstrap: []
    })._rpc.socket.socket;
    simplePeer = webrtcSocket._simple_peer_constructor;
    /**
     * We'll authenticate remove peers by requiring them to sign SDP by their DHT key
     * TODO: ^ is not implemented yet
     *
     * @constructor
     *
     * @param {!Array} options
     */
    function simplePeerDetox(options){
      if (!(this instanceof simplePeerDetox)) {
        return new simplePeerDetox(options);
      }
      simplePeer.call(this, options);
    }
    simplePeerDetox.prototype = Object.create(simplePeer.prototype);
    x$ = simplePeerDetox.prototype;
    /**
     * Dirty hack to get `data` event and handle it the way we want
     */
    x$.emit = function(event, data){
      var command;
      switch (event) {
      case 'signal':
        simplePeer.prototype.emit.apply(this, arguments);
        break;
      case 'data':
        command = data[0];
        if (command === COMMAND_DHT) {
          simplePeer.prototype.emit.call(this, 'data', data.subarray(1));
        } else {
          simplePeer.prototype.emit.call(this, 'routing_data', command, data.subarray(1));
        }
        break;
      default:
        simplePeer.prototype.emit.apply(this, arguments);
      }
    };
    /**
     * @param {!Object} signal
     */
    x$.signal = function(signal){
      simplePeer.prototype.emit.call(this, signal);
    };
    /**
     * Data sending method that will be used by DHT
     *
     * @param {Buffer} data
     */
    x$.send = function(data){
      this.real_send(data, COMMAND_DHT);
    };
    /**
     * Data sending method that will be used by anonymous routing
     *
     * @param {Uint8Array}	data
     * @param {number}		command 1..255 - routing data command being sent
     */
    x$.send_routing_data = function(data, command){
      this.real_send(data, command);
    };
    /**
     * Actual data sending method moved here
     *
     * @param {Uint8Array}	data
     * @param {number}		command
     */
    x$.real_send = function(data, command){
      var x$, data_with_header;
      x$ = data_with_header = new Uint8Array(data.length + 1);
      x$.set([command]);
      x$.set(data, 1);
      simplePeer.prototype.send.call(this, data_with_header);
    };
    Object.defineProperty(simplePeerDetox.prototype, 'constructor', {
      enumerable: false,
      value: simplePeerDetox
    });
    /**
     * @param {!Uint8Array} data
     *
     * @return {string}
     */
    function sha3_256(data){
      var shaObj;
      shaObj = new jsSHA('SHA3-256', 'ARRAYBUFFER');
      shaObj.update(array);
      return shaObj.getHash('HEX');
    }
    /**
     * @constructor
     *
     * @param {!Uint8Array}	public_key		Ed25519 public key
     * @param {!string[]}	bootstrap_nodes
     * @param {!Object[]}	ice_servers
     * @param {number}		bucket_size
     *
     * @return {DHT}
     */
    function DHT(public_key, bootstrap_nodes, ice_servers, bucket_size){
      var x$, this$ = this;
      bucket_size == null && (bucket_size = 2);
      if (!(this instanceof DHT)) {
        return new DHT(public_key, bootstrap_nodes, ice_servers, bucket_size);
      }
      asyncEventer.call(this);
      this._socket = webrtcSocket({
        simple_peer_constructor: simplePeerDetox,
        simple_peer_opts: {
          config: {
            iceServers: ice_servers
          }
        }
      });
      x$ = this._socket;
      x$.on('node_connected', function(string_id){
        var id;
        id = hex2array(string_id);
        peer_connection.on('routing_data', function(command, data){
          switch (command) {
          case COMMAND_TAG:
            this$._socket.add_tag(string_id, 'detox-responder');
            this$.fire('node_tagged', id);
            break;
          case COMMAND_UNTAG:
            this$._socket.del_tag(string_id, 'detox-responder');
            this$.fire('node_untagged', id);
            break;
          case COMMAND_DATA:
            this$.fire('data', id, data);
          }
        });
        this$.fire('node_connected', id);
      });
      x$.on('node_disconnected', function(string_id){
        this$.fire('node_disconnected', hex2array(string_id));
      });
      this._dht = new DHT({
        bootstrap: bootstrap_nodes,
        hash: sha3_256,
        k: bucket_size,
        nodeId: public_key,
        socket: this._socket
      });
    }
    DHT.prototype = Object.create(asyncEventer.prototype);
    y$ = DHT.prototype;
    /**
     * Start WebSocket server listening on specified ip:port, so that current node will be capable of acting as bootstrap node for other users
     *
     * @param {number}	port
     * @param {string}	ip
     */
    y$['start_bootstrap_node'] = function(port, ip){
      this._dht.listen(port, ip);
    };
    /**
     * @return {!string[]}
     */
    y$['get_bootstrap_nodes'] = function(){
      return this._dht.toJSON().nodes;
    };
    /**
     * Start lookup for specified node ID (listen for `node_connected` in order to know when interested node was connected)
     *
     * @param {Uint8Array} id
     */
    y$['lookup'] = function(id){
      this._dht.lookup(array2hex(id));
    };
    /**
     * Tag connection to specified node ID as used, so that it is not disconnected when not used by DHT itself
     *
     * @param {Uint8Array} id
     */
    y$['add_used_tag'] = function(id){
      var string_id, peer_connection;
      string_id = array2hex(id);
      peer_connection = this._socket.get_id_mapping(string_id);
      if (peer_connection) {
        peer_connection.send_routing_data(new Uint8Array(0), COMMAND_TAG);
        this._socket.add_tag(string_id, 'detox-initiator');
      }
    };
    /**
     * Remove tag from connection, so that it can be disconnected if not needed by DHT anymore
     *
     * @param {Uint8Array} id
     */
    y$['del_used_tag'] = function(id){
      var string_id, peer_connection;
      string_id = array2hex(id);
      peer_connection = this._socket.get_id_mapping(string_id);
      if (peer_connection) {
        peer_connection.send_routing_data(new Uint8Array(0), COMMAND_UNTAG);
        this._socket.del_tag(string_id, 'detox-initiator');
      }
    };
    /**
     * Send data to specified node ID
     *
     * @param {Uint8Array} id
     * @param {Uint8Array} data
     */
    y$['send_data'] = function(id, data){
      var string_id, peer_connection;
      string_id = array2hex(id);
      peer_connection = this._socket.get_id_mapping(string_id);
      if (peer_connection) {
        peer_connection.send_routing_data(data, COMMAND_DATA);
      }
    };
    /**
     * @param {Function} callback
     */
    y$['destroy'] = function(callback){
      this._dht.destroy(callback);
      delete this._dht;
    };
    Object.defineProperty(DHT.prototype, 'constructor', {
      enumerable: false,
      value: DHT
    });
    return {
      'DHT': DHT
    };
  }
  if (typeof define === 'function' && define['amd']) {
    define(['webtorrent-dht', 'ronion', 'jssha/src/sha3', 'async-eventer'], Transport);
  } else if (typeof exports === 'object') {
    module.exports = Transport(require('webtorrent-dht'), require('ronion'), require('jssha/src/sha3'), require('async-eventer'));
  } else {
    this['detox_transport'] = Transport(this['webtorrent_dht'], this['ronion'], this['jsSHA'], this['async_eventer']);
  }
}).call(this);
