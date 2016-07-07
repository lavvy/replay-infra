/*
    This Service Watch file, it will emit event when the file is not changed for a while.
*/

// all requires
var fs = require('fs');
var event = require('./EventEmitterSingleton');

// const
const SERVICE_NAME = '#FileWatcher#',
	MAX_CHECK_TRIES = 3;

// export out service.
module.exports = new FileWatcher();

// Init the FileWathcer Service.
function FileWatcher() {
	var _CurrentFileSize = -1,
		_FileTimer,
		_timeToWait = 5000,
		_checkingAttempts = 1;

	// Stoping the timer when it needed.
	var _StopTimer = function(timer) {
		if (timer) {
			clearInterval(timer);
		}
		_CurrentFileSize = -1;
		_checkingAttempts = 1;
	};

	// Check the file Size, when it not growing it will emit event.
	var _CheckFileSize = function(path) {
		const METHOD_NAME = 'CheckFileSize';
		// console.log(SERVICE_NAME, '.', METHOD_NAME, ' start running...');
		// Get the State Of the file.
		fs.stat(path, function(err, stat) {
			if (err) {
				if (_checkingAttempts === MAX_CHECK_TRIES) {
					// Emit event of error and stop the timer.
					event.emit('FileDontExist_FileWatcher', 'Error accured in :' + SERVICE_NAME + '.' + METHOD_NAME + ': ' + err);
					console.log(SERVICE_NAME, METHOD_NAME, ': ', 'Stop the Timer...');
					_StopTimer(_FileTimer);
					console.log(err);
				} else {
					console.log('try one more time');
					_checkingAttempts++;
				}
				return false;
			}

			console.log(SERVICE_NAME, METHOD_NAME, ' CurrentFileSize: ', stat.size, ' | LastFileSize: ', _CurrentFileSize);

			// Check if the file size is bigger than the last check.
			if (stat.size > _CurrentFileSize) {
				// Update the file size.
				_CurrentFileSize = stat.size;
			} else {
				// Callback called when the file stopped grow.
				console.log(SERVICE_NAME, METHOD_NAME, ': ', 'Stop the Timer...');
				_StopTimer(_FileTimer);
				event.emit('FileWatchStop');
			}
			// console.log(SERVICE_NAME, '.', METHOD_NAME, ' Finished...');
		});
	};

	/*
	    This func start watch given file,
	    It Check every X seconds if the file has changed, if it didnt change in the last X seconds, it will stop watch the file and will emit event.

	    Params should contain at least Path To the file we want to watch.
	*/
	var startWatchFile = function(params) {
		var promise = new Promise(function(resolve, reject) {
			const METHOD_NAME = 'StartWatchFile';
			// Check if there is path.
			if (params.timeToWait) {
				_timeToWait = params.timeToWait;
			}
			if (!params.path) {
				return reject('Error accured in ' + SERVICE_NAME + '.' + METHOD_NAME + ' : Path cannot be undefined');
			}

			console.log(SERVICE_NAME, METHOD_NAME, ' Init new interval...');
			console.log(SERVICE_NAME, METHOD_NAME, ' Start checking at:', params.path);

			// Start Timer to follow the file.
			_FileTimer = setInterval(function() {
				_CheckFileSize(params.path);
			}, _timeToWait);

			// console.log(SERVICE_NAME, '.', METHOD_NAME, ' Finished...');
			return resolve(_FileTimer);
		});
		return promise;
	};

	/*
	    This func stop the follow of the file when it needed.
	*/
	var stopWatchFile = function(timer) {
		_StopTimer(timer);
	};

	return {
		startWatchFile: startWatchFile,
		stopWatchFile: stopWatchFile
	};
}