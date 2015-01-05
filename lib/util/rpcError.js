// RpcError is the err argument delivered to the user in rpc callback
// The detail of error code is in constants.RPC_ERROR_CODE
var util = require('util');
var RpcError = function(msg, code) {
  Error.call(this);
  this.code = code;
  this.msg = msg;
  Error.captureStackTrace(this, arguments.callee);
}

util.inherits(RpcError, Error);

module.exports = RpcError;
