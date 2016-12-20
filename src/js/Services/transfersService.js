angular.module('data-transfer')

	.factory('transfersService', ['serviceFactory', 'configService', function (serviceFactory, configService) {
		var service = serviceFactory.getService('mock'); // Service used to upload files ('mock' or 'upload')
		var transfers = []; // Array that contains all transfers
		var runningTransfers = []; // Array that contains all transfers that are running
		var concurentTransfers = configService.getConcurentTransfersQty(); // Get the number of transfers that can run at the same time
		var transfersCompleted = 0; // Number of completed transfers

		// Function that starts a transfer
		function run(trans) {
			trans.status = 'Pending'; // Status is Pending
			service.uploadFile(trans); // Upload the file in the service
		}

		// Event triggered when the user enters the page
		// Loads transfers to run
		$(document).ready(function () {
			transfers = JSON.parse(localStorage.getItem('transfers'));
			for (var i = 0; i < transfers.length; i++) {
				if (transfers[i].status == 'Paused') {
					runningTransfers.push(transfers[i]);
					if (configService.getAutoStart()) {
						run(transfers[i]);
					}
				}
			}
			var loaded = $.Event('loaded');
			$(window).trigger(loaded);
		});

		// Progress event sent by the service (mock or upload)
		$(window).on('progress', function (e) {
			// Search the corresponding transfer in transfers array
			for (var i = 0; i < transfers.length; i++) {
				var currentTransfer = transfers[i];
				if (currentTransfer === e.file) { // If corresponding
					currentTransfer.status = e.state; // Set transfer status
					currentTransfer.prog = e.prog; // Set transfer progress (to display the progressBar)
					currentTransfer.time = e.time;
					i = transfers.length; // Out of the loop
				}
			}
		});

		// Event triggered when the user exits the page
		// Save currently running transfers or queued transfers
		window.onbeforeunload = function (e) {
			var transfersToSave = [];
			for (var i = 0; i < transfers.length; i++) {
				if (transfers[i].status !== 'Succeeded') {
					if (transfers[i].status == 'Pending') {
						transfers[i].status = 'Paused';
					}
					transfersToSave.push(transfers[i]);
				}
			}

			localStorage.setItem('transfers', JSON.stringify(transfersToSave));
			// localStorage.setItem('transfers', '[]');
		};

		// Event triggered by the service when an upload is finished
		$(window).on('complete', function (e) {
			var index = transfers.indexOf(e.file); // Get the index of the file in the transfers array
			var trans = transfers[index]; // Get the file in the transfers (trans is shorter than transfers[index])
			if (e.state == 'Failed') { // If upload has failed
				if (e.file.autoRetries < configService.getAutoRetriesQty()) { // Check if the limit of autoRetries hasn't been reached
					trans.autoRetries++; // Incerment autoRetries counter of this file
					trans.status = 'Queued'; // Status is Queued, so the service knows it should restart the upload of this file from the beginning
					trans.prog = 0;
					trans.time = 0;
					run(trans); // Run the transfer
				}
				else { // If the limit of autoRetries has been reached
					runningTransfers.splice(index, 1); // Remove failed transfer from running transfers array
					if (configService.getAutoStart()) {
						// Look for the next queued transfer in the transfers array
						for (var transfersCount = 0; transfersCount < transfers.length; transfersCount++) {
							if (transfers[transfersCount].status === 'Queued') {
								run(transfers[transfersCount]); // Run this transfer
								transfersCount = transfers.length; // Out of the loop
							}
						}
					}
				}
			}
			else if (e.state == 'Succeeded') { // If upload has succeeded
				var offset = concurentTransfers - 1; // Offset for the index to get the next transfer
				transfersCompleted++; // Incerment the counter of completed transfers
				if (transfersCompleted < transfers.length - offset) { // If there is still queued transfers
					runningTransfers.splice(index, 1); // Remove succeeded transfer from running transfers array
					if (configService.getAutoStart()) { // If upload should start automatically
						runningTransfers.push(transfers[transfersCompleted + offset]); // Add next queued transfer to running transfers array
						run(transfers[transfersCompleted + offset]); // Run this transfer
					}
				}
			}
		});

		// Object returned by transfersService 
		return {
			// Function that adds a transfer to the transfers array
			pushTransfer: function (trans) {
				trans.autoRetries = 0; // The transfer hasn't been retried yet
				trans.prog = 0;
				transfers.push(trans); // Add transfer
				if (configService.getAutoStart()) { // If it should start automatically
					if (runningTransfers.length < concurentTransfers) { // If the limit of concurent transfers is not reached
						runningTransfers.push(trans); // Add the transfer to the running transfers array
						run(trans); // Run the transfer
					}
				}
			},
			// Function that returns all transfers (array)
			getTransfers: function () {
				return transfers;
			},
			// Start upload
			start: function (trans) {
				if (!configService.getAutoStart()) { // If transfer should not start automatically
					if (runningTransfers.length < concurentTransfers && trans.status === 'Queued') { // If transfer is queued and concurent transfers limit is not reached
						runningTransfers.push(trans); // Add transfer to transfers array
						run(trans); // Run transfer
					}
					else if (runningTransfers.length <= concurentTransfers && trans.status === 'Paused') { // If transfer id paused and concurent transfers limit is exceeded
						service.resume(trans); // Resume transfer
					}
				}
				else { // If transfer should run automatically
					if (trans.status === 'Queued' || trans.status === 'Failed') { // If transfer is queued or failed
						trans.prog = 0;
						trans.time = 0;
						run(trans); // Run transfer
					}
					else if (trans.status === 'Paused') { // If transfer is paused
						service.resume(trans); // Resume transfer
					}
				}
			},
			// Function that supsends transfer
			pause: function (trans) {
				service.pause(trans);
			},
			// Function that stops transfer
			stop: function (trans) {
				var index = runningTransfers.indexOf(trans); // Get the index in running transfers
				if (trans.status === 'Pending') {
					runningTransfers.splice(index, 1); // Remove transfer from running transfers array
				}
				service.stop(trans); // Stop transfer
			}
		};
	}]); 