const {Cc, Ci} = require("chrome");
var observerService = require("observer-service");
const data = require("self").data;
var loggingDB = require("logging-db");
var timers = require("timers");
var pageManager = require("page-manager");

exports.run = function() {

	// Set up logging
	var createHttpRequestTable = data.load("create_http_request_table.sql");
	loggingDB.executeSQL(createHttpRequestTable, false);
	var createHttpRequestHeadersTable = data.load("create_http_request_headers_table.sql");
	loggingDB.executeSQL(createHttpRequestHeadersTable, false);
	var requestID = 0;
	
	var createHttpResponseTable = data.load("create_http_response_table.sql");
	loggingDB.executeSQL(createHttpResponseTable, false);
	var createHttpResponseHeadersTable = data.load("create_http_response_headers_table.sql");
	loggingDB.executeSQL(createHttpResponseHeadersTable, false);
	var responseID = 0;

	// Instrument HTTP requests
	observerService.add("http-on-modify-request", function(subject, data) {
		var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
		
		var update = {};
		
		update["id"] = requestID;
		
		var url = httpChannel.URI.spec;
		update["url"] = loggingDB.escapeString(url);
		
		var requestMethod = httpChannel.requestMethod;
		update["method"] = loggingDB.escapeString(requestMethod);
		
		var referrer = "";
		if(httpChannel.referrer)
			referrer = httpChannel.referrer.spec;
		update["referrer"] = loggingDB.escapeString(referrer);
		
		update["page_id"] = pageManager.pageIDFromHttpChannel(httpChannel);
		
		loggingDB.executeSQL(loggingDB.createInsert("http_requests", update), true);
		
		httpChannel.visitRequestHeaders({visitHeader: function(name, value) {
			var update = {};
			update["http_request_id"] = requestID;
			update["name"] = loggingDB.escapeString(name);
			update["value"] = loggingDB.escapeString(value);
			loggingDB.executeSQL(loggingDB.createInsert("http_request_headers", update), true);
		}});
		
		// Associate the request ID with the HTTP channel object
		var httpChannelProperties = subject.QueryInterface(Ci.nsIWritablePropertyBag2); 
		httpChannelProperties.setPropertyAsInt32("request_id", requestID);
		
		requestID++;
	});
	
	// Instrument HTTP responses
	var httpResponseHandler = function(subject, data, isCached) {
		var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
		
		var update = {};
		
		update["id"] = responseID;
		
		var url = httpChannel.URI.spec;
		update["url"] = loggingDB.escapeString(url);
		
		var requestMethod = httpChannel.requestMethod;
		update["method"] = loggingDB.escapeString(requestMethod);
		
		var referrer = "";
		if(httpChannel.referrer)
			referrer = httpChannel.referrer.spec;
		update["referrer"] = loggingDB.escapeString(referrer);
		
		var responseStatus = httpChannel.responseStatus;
		update["response_status"] = responseStatus;
		
		var responseStatusText = httpChannel.responseStatusText;
		update["response_status_text"] = loggingDB.escapeString(responseStatusText);
		
		update["page_id"] = pageManager.pageIDFromHttpChannel(httpChannel);
		
		update["is_cached"] = loggingDB.boolToInt(isCached);
		
		var initiatingRequestID = -1;
		// Recover the request ID from the HTTP channel object
		var httpChannelProperties = subject.QueryInterface(Ci.nsIPropertyBag2);
		if(httpChannelProperties.hasKey("request_id"))
			initiatingRequestID = httpChannelProperties.getPropertyAsInt32("request_id");
		update["http_request_id"] = initiatingRequestID;
		
		loggingDB.executeSQL(loggingDB.createInsert("http_responses", update), true);
		
		httpChannel.visitResponseHeaders({visitHeader: function(name, value) {
			var update = {};
			update["http_response_id"] = responseID;
			update["name"] = loggingDB.escapeString(name);
			update["value"] = loggingDB.escapeString(value);
			loggingDB.executeSQL(loggingDB.createInsert("http_response_headers", update), true);
		}});
		
		responseID++;
	};
	
	observerService.add("http-on-examine-response", function(subject, data) {
		httpResponseHandler(subject, data, false);
	});
	
	// Instrument cached HTTP responses
	observerService.add("http-on-examine-cached-response", function(subject, data) {
		httpResponseHandler(subject, data, true);
	});

};