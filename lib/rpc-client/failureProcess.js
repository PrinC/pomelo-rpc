var domain = require('domain');
var RpcError = require('../util/rpcError');
var utils = require('../util/utils');
var constants = require('../util/constants');
var logger = require('pomelo-logger').getLogger('pomelo-rpc', __filename);

module.exports = function(code, tracer, serverId, msg, opts) {
	var cb = tracer.cb;
  var mode = opts.failMode;
  switch(mode) {
    case constants.FAIL_MODE.FAILOVER:
      method = failover;
    break;
    case constants.FAIL_MODE.FAILBACK:
      method = failback;
    break;
    case constants.FAIL_MODE.FAILFAST:
      method = failfast;
    break;
    case constants.FAIL_MODE.FAILSAFE:
    default:
      method = failsafe;
    break;
  }
  method.call(this, code, tracer, serverId, msg, opts, cb);
};



/**
 * Failover rpc failure process. This will try other servers with option retries.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
var failover = function(code, tracer, serverId, msg, opts, cb) {
	var servers;
	var self = this;
	var counter = 0;
	var success = true;
	var serverType = msg.serverType;
	if(!tracer.servers)	{
		servers = self.serversMap[serverType];
	}	else {
		servers = tracer.servers;
	}

	var index = servers.indexOf(serverId);
	if(index >= 0) {
			servers.splice(index, 1);
	}
	tracer.servers = servers;

	if(!servers.length)	{
		logger.error('[pomelo-rpc] rpc failed with all this type of servers, with serverType: %s', serverType);
		utils.invokeCallback(cb, new Error('rpc failed with all this type of servers, with serverType: ' + serverType));
		return;
	}
	self.dispatch.call(self, tracer, servers[0], msg, opts, cb);
};

/**
 * Failsafe rpc failure process.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
var failsafe = function(code, tracer, serverId, msg, opts, cb) {
	var self = this;
	var retryTimes = opts.retryTimes || constants.DEFAULT_PARAM.FAILSAFE_RETRIES;
	var retryConnectTime = opts.retryConnectTime || constants.DEFAULT_PARAM.FAILSAFE_CONNECT_TIME;

	if(!tracer.retryTimes) {
		tracer.retryTimes = 1;
	} else {
		tracer.retryTimes += 1;
	}
  var errCode = -1;
	switch(code) {
		case constants.RPC_ERROR.SERVER_NOT_STARTED:
      errCode = constants.RPC_ERROR_CODE.SERVER_NOT_STARTED;
      utils.invokeCallback(cb, new RpcError('rpc server is not start', errCode));
		case constants.RPC_ERROR.NO_TARGET_SERVER:
      errCode = constants.RPC_ERROR_CODE.NO_TARGET_SERVER
			utils.invokeCallback(cb, new RpcError('rpc client cannot find remote server.', errCode));
			break;
		case constants.RPC_ERROR.FAIL_CONNECT_SERVER:
      errCode = constants.RPC_ERROR_CODE.FAIL_CONNECT_SERVER;
			if(tracer.retryTimes <= retryTimes)	{
				setTimeout(function() {
					self.connect(tracer, serverId, cb);
				}, retryConnectTime * tracer.retryTimes);
			} else {
				utils.invokeCallback(cb, new RpcError('rpc client failed to connect to remote server: ' + serverId, errCode));
			}
			break;
		case constants.RPC_ERROR.FAIL_FIND_MAILBOX:
      errCode = constants.RPC_ERROR_CODE.FAIL_FIND_MAILBOX;
		case constants.RPC_ERROR.FAIL_SEND_MESSAGE:
      if (errCode == -1)
		    errCode = constants.RPC_ERROR_CODE.FAIL_SEND_MESSAGE;
			if(tracer.retryTimes <= retryTimes)	{
				setTimeout(function() {
					self.dispatch.call(self, tracer, serverId, msg, opts, cb);
				}, retryConnectTime * tracer.retryTimes);
			} else {
        if (errCode == constants.RPC_ERROR_CODE.FAIL_FIND_MAILBOX)
				  utils.invokeCallback(cb, new RpcError('rpc client failed to find mailbox', errCode));
        else
				  utils.invokeCallback(cb, new RpcError('rpc client failed to send message to remote server: ' + serverId, errCode));
			}
			break;
		case constants.RPC_ERROR.FILTER_ERROR:
      errCode = constants.RPC_ERROR_CODE.FILTER_ERROR;
			utils.invokeCallback(cb, new RpcError('rpc client filter encounters error.', errCode));
			break;
		default:
      errCode = constants.RPC_ERROR_CODE.UNKOWN;
		  utils.invokeCallback(cb, new RpcError('rpc client unknown error.', errCode));
	}
};

/**
 * Failback rpc failure process. This will try the same server with sendInterval option and retries option.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
var failback = function(code, tracer, serverId, msg, opts, cb) {
	// todo record message in background and send the message at timing
};

/**
 * Failfast rpc failure process. This will ignore error in rpc client.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
var failfast = function(code, tracer, serverId, msg, opts, cb) {
	logger.error('rpc failed with error, remote server: %s, msg: %j, error code: %s', serverId, msg, code);
	utils.invokeCallback(cb, new Error('rpc failed with error code: ' + code));
};
