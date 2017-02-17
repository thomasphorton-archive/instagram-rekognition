var express = require('express');
var cookieSession = require('cookie-session');
var app = express();
var request = require('request').defaults({encoding: null});
var ig = require('instagram-node').instagram();
var AWS = require('aws-sdk');
var igConfig = require('./config/instagram');

const igAPIPrefix = 'https://api.instagram.com/v1';

ig.use(igConfig);

var config = {
  port: 3000,
  redirectUri: '/handleauth',
  hostname: 'http://localhost:3000'
}

var exports = {};

app.set('view engine', 'pug');
app.set('trust proxy', 1);

var sessionParams = {
  name: 'session',
  keys: ['secret']
}

app.use(cookieSession(sessionParams));
app.use(express.static('public'))

app.get('/', function (req, res) {

  if (req.session.ig) {
    var user = req.session.ig.user;
  } else {
    var user = '';
  }

  res.render('index', {
    title: 'Title',
    user: user,
  });
});

app.get('/logout', function(req, res) {
  req.session = null;
  res.render('index', {
    alert: {
      type: 'success',
      message: 'Logged out successfully.'
    }
  });
});

app.get('/media', function(req, res) {
  exports.checkLoggedIn(req, res, function() {
    request.get({
      url: igAPIPrefix + '/users/self/media/recent',
      qs: {
        access_token: req.session.ig.access_token
      }
    }, function(err, response, body) {
      if (err) {
        console.log('err:', err);
      } else if (!err && response.statusCode == 200) {

        var data = JSON.parse(body);

        console.log(data.data[0]);

        console.log('token:', req.session.ig.access_token);
        res.render('media-list', {
          title: 'Media',
          message: 'Hello!',
          data: data.data,
          user: req.session.ig.user
        });
     } 
    });
  });
});

app.get('/privacy', function(req, res) {
  res.render('privacy');
});

app.get('/tag-search/:tag', function(req, res) {
  var tag = req.params.tag;
  var url = igAPIPrefix + '/tags/' + tag;

  request.get({
      url: url,
      qs: {
        access_token: req.session.ig.access_token
      }
    }, function(err, response, body) {
      if (err) {
        console.log('err:', err);
      } else {
        console.log('response:', response);
        // console.log('body:', body);
        var data = JSON.parse(body);
        console.log(data);
        res.send('success');
      }
  });

});

app.get('/media/:id', function(req, res) {
  exports.checkLoggedIn(req, res, function() {
    var url = igAPIPrefix + '/media/' + req.params.id;
    console.log(url);
    request.get({
      url: url,
      qs: {
        access_token: req.session.ig.access_token
      }
    }, function(err, response, body) {
      if (err) {
        console.log('err:', err);
      } else if (!err && response.statusCode == 200) {

        var media = JSON.parse(body).data;
        var rekognition = new AWS.Rekognition({ region: 'us-west-2' });
    
        request.get({
          url: media.images.thumbnail.url,
          encoding: null
        }, function(err, response, body) {
          if (err) {
            console.log('err:', err);
            res.send('error');
          } else {
            // console.log('response: ', response);
            rekognition.detectLabels({
              Image: {
                Bytes: response.body
              },
              MaxLabels: 15,
              MinConfidence: 0
            }, function(err, data) {
              if (err) {
                console.log(err, err.stack);
                res.send('error');
              } else {
                console.log(data);
                res.render('media-single', {
                  title: 'Media',
                  message: 'Hello!',
                  media: media,
                  labels: data.Labels,
                  user: req.session.ig.user
                });
              }
            })
          }
        });
      } 
    });
  });
  
});

exports.handleauth = function(req, res) {

  // Parse token out of querystring.
  var code = res.req.query.code;

  var formData = {
   client_id: igConfig.client_id,
   client_secret: igConfig.client_secret,
   grant_type: 'authorization_code',
   redirect_uri: config.hostname + '/handleauth',
   code: code,
   scope: 'public_content+basic'
  };

  request.post(
   {
     url: 'https://api.instagram.com/oauth/access_token',
     formData: formData
   },
   function(err, response, body) {
     if (err) {
       console.log('err:', err);
       res.send('error authenticating with instagram');
     } else if (!err && response.statusCode == 200) {

       var data = JSON.parse(body);
       req.session.ig = data;
       console.log('token:', req.session.ig.access_token);
       res.redirect('/media')
     } 
   }
  )
}

exports.checkLoggedIn = function(req, res, next) {
  if (req.session.ig && req.session.ig.access_token) {
    next();
  } else {

    // Not logged in, redirect to index.
    res.render('index', {
      alert: {
        type: 'danger',
        message: 'You must be logged in to continue.'
      }
    });
  }
}

app.get('/handleauth', exports.handleauth);

app.listen(config.port, function () {
  console.log('Example app listening on port %s!', config.port);
});