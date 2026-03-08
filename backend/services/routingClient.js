const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '../../routing-cpp/proto/transit.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).transit;

function createRoutingClient(address) {
  return new proto.TransitRouter(address, grpc.credentials.createInsecure());
}

module.exports = { createRoutingClient };
