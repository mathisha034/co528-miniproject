// Jest manual mock for the minio package
// Placed in __mocks__/minio.js relative to the service root

const Client = jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue(undefined),
}));

module.exports = { Client };
