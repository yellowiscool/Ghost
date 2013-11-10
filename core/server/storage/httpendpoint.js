var _           = require('underscore'),
    fs          = require('fs-extra'),
    http        = require('http'),
    mime        = require('mime'),
    moment      = require('moment'),
    nodefn      = require('when/node/function'),
    path        = require('path'),
    when        = require('when'),

    errors      = require('../errorHandling'),
    baseStore   = require('./../storage/base'),
    Ghost       = require('../../ghost'),

    ghost       = new Ghost(),
    options     = {},

    mountPoint = 'content/images',
    httpStore;

if (ghost.config().fileStorage && ghost.config().fileStorage.host
        && ghost.config().fileStorage.port && ghost.config().fileStorage.auth) {

    options = {
        host: ghost.config().fileStorage.host,
        port: ghost.config().fileStorage.port,
        auth: ghost.config().fileStorage.auth
    };
}


httpStore = _.extend(baseStore, {
    'save': function (image) {
        var saved = when.defer(),
            targetDir = this.getTargetDir(mountPoint),
            stream = fs.createReadStream(image.path),
            req;

        this.getUniqueFileName(this, image, targetDir).then(function (filename) {
            // remove the temporary file
            return nodefn.call(fs.unlink, image.path)
                .then(function () {
                    filename = path.join('/', filename);

                    req = http.request(_.extend(options, {
                        method: 'PUT',
                        path: filename

                    }), function (res) {
                        if (res.statusCode === 201 || res.statusCode === 409) {
                            saved.resolve(filename);
                        } else {
                            saved.reject('Proxy Error');
                        }
                    });

                    req.on('error', function (e) {
                        saved.reject('Server Error: ' + e);
                    });

                    // Pipe the image to the server
                    stream.pipe(req);

                    stream.on('end', function () {
                        req.end();
                    });
                });
        }).otherwise(errors.logError);

        return saved.promise;
    },
    'exists': function (filename) {
        filename = path.join('/', filename);

        var done = when.defer(),
            req;

        req = http.request(_.extend(options, {
            method: 'HEAD',
            path: filename
        }), function (res) {
            if (res.statusCode === 200) {
                done.resolve(true);
            } else if (res.statusCode === 404) {
                done.resolve(false);
            }

            done.reject('Proxy Error');
        });

        req.on('error', function (e) {
            done.reject(e);
        });

        req.end();

        return done.promise;
    },
    'serve': function () {
        function isMounted(str) {
            return str.substring(0, mountPoint.length) === mountPoint;
        }

        return function (req, res) {
            var reqPath = isMounted(req.path) ? req.path : path.join('/', mountPoint, req.path),
                getRequest;

            getRequest = http.request(_.extend(options, {
                method: 'GET',
                path: reqPath
            }), function (getResponse) {
                if (getResponse.statusCode === 200) {
                    if (getResponse.headers.hasOwnProperty('content-length')) {
                        res.setHeader('Content-Length', getResponse.headers['content-length']);
                    }
                    if (getResponse.headers.hasOwnProperty('Content-Length')) {
                        res.setHeader('Content-Length', getResponse.headers['Content-Length']);
                    }
                    if (getResponse.headers.hasOwnProperty('last-modified')) {
                        res.setHeader('Last-Modified', getResponse.headers['last-modified']);
                    }
                    if (getResponse.headers.hasOwnProperty('Last-Modified')) {
                        res.setHeader('Last-Modified', getResponse.headers['Last-Modified']);
                    }

                    res.setHeader('Content-Type', mime.lookup(req.path));
                    res.setHeader('Cache-Control', 'public, max-age=31536000000');

                    getResponse.pipe(res);
                } else {
                    res.send(404);
                }
            });

            getRequest.on('error', function (e) {
                // something went wrong, tell the browser this service is currently unavailable
                res.send(503);
            });

            getRequest.end();
        };

    }
});

module.exports = httpStore;