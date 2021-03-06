var path = require('path'),
	util = require('util');

var chai = require('chai'),
	_ = require('lodash'),
	mongoose = require('mongoose'),
	connectMongo = require('replay-schemas/connectMongo'),
	Video = require('replay-schemas/Video'),
	JobStatus = require('replay-schemas/JobStatus'),
	VideoMetadata = require('replay-schemas/VideoMetadata'),
	Query = require('replay-schemas/Query'),
	rabbit = require('replay-rabbitmq'),
	Promise = require('bluebird'),
	JobsService = require('replay-jobs-service');

var fs = Promise.promisifyAll(require('fs'));

chai.use(require('chai-datetime'));

// config chai
chai.config.includeStack = true;
global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;

var _validMetadataObjectsPath = 'expected_parsed_data.json';

// extract outer environment variables which we do not override internally (such as hosts)
var MONGO_HOST = process.env.MONGO_HOST;
var MONGO_PORT = process.env.MONGO_PORT;
var MONGO_DATABASE = process.env.MONGO_DATABASE;
var RABBITMQ_HOST = process.env.RABBITMQ_HOST;
var RABBITMQ_PORT = process.env.RABBITMQ_PORT;
var RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME;
var RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD;
var RABBITMQ_MAX_RESEND_ATTEMPTS = process.env.RABBITMQ_MAX_RESEND_ATTEMPTS;

resetEnvironment();

// used to reset the environments variables after the tests, as they might be overrided
function resetEnvironment() {
	// the idea behind the OR conditions is, that if the env. variable is declared
	// from the outside, then use this value to override the environment each time.
	// else, just use the default values supplied.
	process.env.MONGO_HOST = MONGO_HOST || 'localhost';
	process.env.MONGO_PORT = MONGO_PORT || '27017';
	process.env.MONGO_DATABASE = MONGO_DATABASE || 'replay_test_consumer';
	process.env.STORAGE_PATH = path.join(__dirname, 'data');
	process.env.CAPTURE_STORAGE_PATH = path.join(process.env.STORAGE_PATH, 'capture');
	process.env.RABBITMQ_HOST = RABBITMQ_HOST || 'localhost';
	process.env.RABBITMQ_PORT = RABBITMQ_PORT || '5672';
	process.env.RABBITMQ_USERNAME = RABBITMQ_USERNAME || 'guest';
	process.env.RABBITMQ_PASSWORD = RABBITMQ_PASSWORD || 'guest';
	process.env.RABBITMQ_MAX_RESEND_ATTEMPTS = RABBITMQ_MAX_RESEND_ATTEMPTS || 1;
}
module.exports.resetEnvironment = resetEnvironment;

// connect services
module.exports.connectServices = function () {
	return connectMongo(process.env.MONGO_HOST, process.env.MONGO_PORT, process.env.MONGO_DATABASE, process.env.MONGO_USERNAME, process.env.MONGO_PASSWORD)
		.then(function () {
			return rabbit.connect(process.env.RABBITMQ_HOST, process.env.RABBITMQ_PORT,
				process.env.RABBITMQ_USERNAME, process.env.RABBITMQ_PASSWORD);
		});
};

// wipe mongo collections
module.exports.wipeMongoCollections = function () {
	return Video.remove({})
		.then(function () {
			return JobStatus.remove({});
		})
		.then(function () {
			return VideoMetadata.remove({});
		})
		.then(function () {
			return Query.remove({});
		});
};

module.exports.generateValidMessage = function () {
	var startTime = new Date();
	var endTime = addMinutes(startTime, 30);

	return {
		sourceId: '123',
		videoFileName: 'sample.ts',
		dataFileName: 'sample.data',
		contentDirectoryPath: '/',
		baseName: 'sample',
		requestFormat: 'mp4',
		receivingMethod: {
			standard: 'VideoStandard',
			version: '1.0'
		},
		startTime: startTime,
		endTime: endTime,
		transactionId: new mongoose.Types.ObjectId()
	};
};

module.exports.generateJobStatus = function () {
	return JobStatus.create({});
};

module.exports.generateVideo = function (params, _transactionId) {
	return {
		_id: new mongoose.Types.ObjectId(),
		sourceId: params.sourceId,
		contentDirectoryPath: params.contentDirectoryPath,
		videoFileName: params.videoFileName,
		baseName: params.baseName,
		requestFormat: params.requestFormat,
		receivingMethod: params.receivingMethod,
		jobStatusId: _transactionId,
		startTime: params.startTime,
		endTime: params.endTime
	};
};

// returns metadata objects from the VideoMetadata schema
function getValidMetadataObjects() {
	var fullPathToVideoMetadata = path.join(process.env.STORAGE_PATH, _validMetadataObjectsPath);
	return fs.readFileAsync(fullPathToVideoMetadata, 'utf8')
		.then(function (expectedDataAsString) {
			var metadataObjects = JSON.parse(expectedDataAsString);
			var videoMetadatas = _.map(metadataObjects, function (metadata) {
				return new VideoMetadata(metadata);
			});
			return Promise.resolve(videoMetadatas);
		});
}
module.exports.getValidMetadataObjects = getValidMetadataObjects;

// returns raw javascript metadata objects
module.exports.getValidMetadataAsJson = function () {
	var fullPathToVideoMetadata = path.join(process.env.STORAGE_PATH, _validMetadataObjectsPath);
	return fs.readFileAsync(fullPathToVideoMetadata, 'utf8')
		.then(function (expectedDataAsString) {
			return Promise.resolve(JSON.parse(expectedDataAsString));
		});
};

module.exports.deleteAllQueues = function () {
	var jobConfigs = JobsService.getAllJobConfigs();
	var queueNames = _.map(jobConfigs, function (jobConfig) {
		return jobConfig.queue;
	});

	queueNames.push('FailedJobsQueue');

	var deleteQueuePromises = [];
	for (var i = 0; i < queueNames.length; i++) {
		var queueName = queueNames[i];
		deleteQueuePromises.push(rabbit.deleteQueue(queueName));
	}

	return Promise.all(deleteQueuePromises);
};

function addMinutes(date, minutes) {
	return new Date(date.getTime() + minutes * 60000);
}
module.exports.addMinutes = addMinutes;

// simulate message from the video recorder.
module.exports.generateMessageForTsProcessing = function () {
	var startTime = new Date();
	var endTime = addMinutes(startTime, 30);
	return {
		sourceId: 100,
		videoName: 'my_video_name',
		fileRelativePath: 'sample.ts',
		storagePath: process.env.CAPTURE_STORAGE_PATH,
		receivingMethod: {
			standard: 'VideoStandard',
			version: '1.0'
		},
		startTime: startTime,
		endTime: endTime,
		duration: 30,
		sourceType: 'In VideoStandard V 1.0 it does not matter',
		transactionId: new mongoose.Types.ObjectId()
	};
};

// return the expected message attributes for the specific jobType, possibly with different modes of operation
function getJobExpectedParamKeys(jobType, mode) {
	var params;

	switch (jobType) {
		case 'SaveVideo':
			switch (mode) {
				case 'VideoStandard-1.0':
					params = {
						sourceId: undefined,
						contentDirectoryPath: undefined,
						dataFileName: undefined,
						baseName: undefined,
						receivingMethod: {
							standard: undefined,
							version: undefined
						},
						requestFormat: undefined,
						startTime: undefined,
						endTime: undefined,
						duration: undefined,
						transactionId: undefined,
						flavors: undefined,
						videoFileName: undefined
					};
					break;
				case 'VideoStandard-0.9-video':
					params = {
						sourceId: undefined,
						contentDirectoryPath: undefined,
						baseName: undefined,
						receivingMethod: {
							standard: undefined,
							version: undefined
						},
						requestFormat: undefined,
						startTime: undefined,
						endTime: undefined,
						duration: undefined,
						transactionId: undefined,
						flavors: undefined,
						videoFileName: undefined
					};
					break;
				case 'VideoStandard-0.9-metadata':
					params = {
						sourceId: undefined,
						contentDirectoryPath: undefined,
						dataFileName: undefined,
						baseName: undefined,
						receivingMethod: {
							standard: undefined,
							version: undefined
						},
						startTime: undefined,
						endTime: undefined,
						duration: undefined,
						transactionId: undefined,
						flavors: undefined
					};
					break;
				case 'Stanag-4609':
					params = {
						sourceId: undefined,
						contentDirectoryPath: undefined,
						dataFileName: undefined,
						baseName: undefined,
						receivingMethod: {
							standard: undefined,
							version: undefined
						},
						requestFormat: undefined,
						startTime: undefined,
						endTime: undefined,
						duration: undefined,
						transactionId: undefined,
						flavors: undefined,
						videoFileName: undefined
					};
					break;
				default:
					throw new Error('Unsupported mode.');
			}
			break;
		case 'MetadataParser':
			params = {
				sourceId: undefined,
				videoId: undefined,
				dataFileName: undefined,
				contentDirectoryPath: undefined,
				receivingMethod: {
					standard: undefined,
					version: undefined
				},
				transactionId: undefined
			};
			break;
		case 'AttachVideoToMetadata':
			switch (mode) {
				case 'Video':
					params = {
						transactionId: undefined,
						sourceId: undefined,
						video: undefined
					};
					break;
				case 'Metadatas':
					params = {
						transactionId: undefined,
						sourceId: undefined,
						metadatas: undefined
					};
					break;
				default:
					throw new Error('Unsupported mode.');
			}
			break;
		case 'MetadataToMongo':
			params = {
				transactionId: undefined,
				metadatas: undefined
			};
			break;
		case 'VideoBoundingPolygon':
			params = {
				transactionId: undefined,
				videoId: undefined
			};
			break;
		case 'MetadataToCaptions':
			params = {
				transactionId: undefined,
				videoId: undefined
			};
			break;
		default:
			throw new Error('Job type is missing.');
	}

	return Object.keys(params);
}

module.exports.testJobProduce = function (done, service, message, jobType, serviceMode) {
	service.start(message,
		function _error() {
			done(new Error(util.format('%s\'s service has errored.', jobType)));
		},
		function _done() {
			var queueName = JobsService.getQueueName(jobType);
			rabbit.consume(queueName, 1, function (params, __error, __done) {
				expect(Object.keys(params).sort()).to.deep.equal(getJobExpectedParamKeys(jobType, serviceMode).sort());
				__done();
				done();
			});
		}
	);
};
