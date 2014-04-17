/* global java, __phantom_writeFile */
(function() {
    var UNDEFINED;
    function getJasmineRequireObj() {
        if (typeof module !== "undefined" && module.exports) {
            return exports;
        } else {
            window.jasmineRequire = window.jasmineRequire || {};
            return window.jasmineRequire;
        }
    }

    if (typeof getJasmineRequireObj() == 'undefined') {
        throw new Error("jasmine 2.0 must be loaded before jasmine-junit");
    }

    function elapsed(startTime, endTime) {
        return (endTime - startTime)/1000;
    }

    function ISODateString(d) {
        function pad(n) { return n < 10 ? '0'+n : n; }
        return d.getFullYear() + '-' +
            pad(d.getMonth()+1) + '-' +
            pad(d.getDate()) + 'T' +
            pad(d.getHours()) + ':' +
            pad(d.getMinutes()) + ':' +
            pad(d.getSeconds());
    }

    function trim(str) {
        return str.replace(/^\s+/, "" ).replace(/\s+$/, "" );
    }

    function escapeInvalidXmlChars(str) {
        return str.replace(/</g, "&lt;")
            .replace(/\>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/\'/g, "&apos;")
            .replace(/\&/g, "&amp;");
    }

    function isFailed(obj) {
        return obj.status === "failed";
    }
    function isSkipped(obj) {
        return obj.status === "pending";
    }

    /**
     * Generates JUnit XML for the given spec run. There are various options
     * to control where the results are written, and the default values are
     * set to create as few .xml files as possible. It is possible to save a
     * single XML file, or an XML file for each top-level `describe`, or an
     * XML file for each `describe` regardless of nesting.
     *
     * Accepts the following options:
     *
     * @param {string} savePath directory to save the files (default: '')
     * @param {boolean} consolidateAll whether to save all test results in a
     *                  single file (default: true)
     *                  NOTE: if true, {filePrefix} is treated as the full
     *                    filename (excluding extension)
     * @param {boolean} consolidate whether to save nested describes within the
     *                  same file as their parent (default: true)
     *                  NOTE: true does nothing if consolidateAll is also true.
     *                  NOTE: false also sets consolidateAll to false.
     * @param {boolean} useDotNotation whether to separate suite names with
     *                  dots instead of spaces, ie "Class.init" not "Class init"
     *                  (default: true)
     * @param {string} filePrefix is the string value that is prepended to the
     *                  xml output file (default: junitresults-)
     *                  NOTE: if consolidateAll is true, the default is simply
     *                    "junitresults" and this becomes the actual filename,
     *                    ie "junitresults.xml"
     */
    var JUnitXmlReporter = function(options) {
        options = options || {};
        options.savePath = options.savePath || '';
        options.consolidate = options.consolidate === UNDEFINED ? true : options.consolidate;
        options.consolidateAll = options.consolidate !== false && (options.consolidateAll === UNDEFINED ? true : options.consolidateAll);
        options.useDotNotation = options.useDotNotation === UNDEFINED ? true : options.useDotNotation;
        options.filePrefix = options.filePrefix || (options.consolidateAll ? 'junitresults' : 'junitresults-');

        var suites = [],
            currentSuite = null,
            failedCount = 0;

        this.jasmineStarted = function(started) {
            JUnitXmlReporter.startTime = (new Date()).getTime();
        };
        this.suiteStarted = function(suite) {
            suite._startTime = new Date();
            suite._specs = [];
            suite._suites = [];
            suite._failures = 0;
            suite._skipped = 0;
            suite._parent = currentSuite;
            if (!currentSuite) {
                suites.push(suite);
            } else {
                currentSuite._suites.push(suite);
            }
            currentSuite = suite;
        };
        this.specStarted = function(spec) {
            spec._startTime = new Date();
            spec._suite = currentSuite;
            currentSuite._specs.push(spec);
        };
        this.specDone = function(spec) {
            spec._endTime = new Date();
            if (isSkipped(spec)) { spec._suite._skipped++; }
            if (isFailed(spec)) { spec._suite._failures++; }
        };
        this.suiteDone = function(suite) {
            suite._endTime = new Date();
            currentSuite = suite._parent;
        };
        this.jasmineDone = function() {
            var output = '';
            for (var i = 0; i < suites.length; i++) {
                output += this.getOrWriteNestedOutput(suites[i]);
            }
            // if we have anything to write here, write out the consolidated file
            if (output) {
                this.writeFile(options.filePrefix, output);
            }
            // this is so phantomjs-testrunner.js can tell if we're done executing
            JUnitXmlReporter.endTime = new Date();
        };

        this.getOrWriteNestedOutput = function(suite) {
            var output = suiteAsXml(suite);
            for (var i = 0; i < suite._suites.length; i++) {
                output += this.getOrWriteNestedOutput(suite._suites[i]);
            }
            if (options.consolidateAll || options.consolidate && suite._parent) {
                return output;
            } else {
                // if we aren't supposed to consolidate output, just write it now
                this.writeFile(generateFilename(suite), output);
                return '';
            }
        };

        var prefix = '<?xml version="1.0" encoding="UTF-8" ?>';
        prefix += '\n<testsuites>';
        var suffix = '\n</testsuites>';
        this.writeFile = function(filename, text) {
            if (filename.substr(-4) !== '.xml') { filename += '.xml'; }
            // Add the prefix and suffix once for each file
            text = prefix + text + suffix;

            var path = options.savePath;
            function getQualifiedFilename(separator) {
                if (path && path.substr(-1) !== separator && filename.substr(0) !== separator) {
                    path += separator;
                }
                return path + filename;
            }

            // Rhino
            try {
                // turn filename into a qualified path
                if (path) {
                    filename = getQualifiedFilename(java.lang.System.getProperty("file.separator"));
                    // create parent dir and ancestors if necessary
                    var file = java.io.File(filename);
                    var parentDir = file.getParentFile();
                    if (!parentDir.exists()) {
                        parentDir.mkdirs();
                    }
                }
                // finally write the file
                var out = new java.io.BufferedWriter(new java.io.FileWriter(filename));
                out.write(text);
                out.close();
                return;
            } catch (e) {}
            // PhantomJS, via a method injected by phantomjs-testrunner.js
            try {
                // turn filename into a qualified path
                filename = getQualifiedFilename(window.fs_path_separator);
                __phantom_writeFile(filename, text);
                return;
            } catch (f) {}
            // Node.js
            try {
                var fs = require("fs");
                var nodejs_path = require("path");
                var fd = fs.openSync(nodejs_path.join(path, filename), "w");
                fs.writeSync(fd, text, 0);
                fs.closeSync(fd);
                return;
            } catch (g) {}
        };

        /************* Helper functions that need closure access *************/
        function generateFilename(suite) {
            return options.filePrefix + getFullyQualifiedSuiteName(suite, true) + '.xml';
        }

        function getFullyQualifiedSuiteName(suite, isFilename) {
            var fullName;
            if (options.useDotNotation) {
                fullName = suite.description;
                for (var parent = suite._parent; parent; parent = parent._parent) {
                    fullName = parent.description + '.' + fullName;
                }
            } else {
                fullName = suite.fullName;
            }

            // Either remove or escape invalid XML characters
            if (isFilename) {
                return fullName.replace(/[^\w]/g, "");
            }
            return escapeInvalidXmlChars(fullName);
        }

        function suiteAsXml(suite) {
            var xml = '\n <testsuite name="' + getFullyQualifiedSuiteName(suite) + '"';
            xml += ' timestamp="' + ISODateString(suite._startTime) + '"';
            xml += ' time="' + elapsed(suite._startTime, suite._endTime) + '"';
            xml += ' errors="0"';
            xml += ' tests="' + suite._specs.length + '"';
            xml += ' skipped="' + suite._skipped + '"';
            // Because of JUnit's flat structure, only include directly failed tests (not failures for nested suites)
            xml += ' failures="' + suite._failures + '"';
            xml += '>';

            for (var i = 0; i < suite._specs.length; i++) {
                xml += specAsXml(suite._specs[i]);
            }
            xml += '\n </testsuite>';
            return xml;
        }
        function specAsXml(spec) {
            var xml = '\n  <testcase classname="' + getFullyQualifiedSuiteName(spec._suite) + '"';
            xml += ' name="' + escapeInvalidXmlChars(spec.description) + '"';
            xml += ' time="' + elapsed(spec._startTime, spec._endTime) + '"';
            xml += '>';

            if (isSkipped(spec)) {
                xml += '<skipped />';
            } else if (isFailed(spec)) {
                for (var i = 0, failure; i < spec.failedExpectations.length; i++) {
                    failure = spec.failedExpectations[i];
                    xml += '\n   <failure type="' + (failure.matcherName || "exception") + '"';
                    xml += ' message="' + trim(escapeInvalidXmlChars(failure.message))+ '"';
                    xml += '>';
                    xml += '<![CDATA[' + trim(failure.stack || failure.message) + ']]>';
                    xml += '\n   </failure>';
                }
            }
            xml += '\n  </testcase>';
            return xml;
        }
    };

    // export public
    getJasmineRequireObj().JUnitXmlReporter = JUnitXmlReporter;
})();
