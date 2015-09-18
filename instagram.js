var express       = require('express');
var cookieParser  = require('cookie-parser');
var instaApi      = require('instagram-node').instagram();
var fs            = require('fs');
var Bluebird      = require('bluebird');
var router        = express.Router();
var Lob           = require('lob')(process.env.lob_api_key);
var request       = require('request');
var stripe        = require("stripe")(process.env.stripe_key);

Bluebird.promisifyAll(instaApi);

var NODE_ENV = process.env.NODE_ENV || 'development';
var redirect_uri =  (NODE_ENV === 'production') ? 'https://pennypost.herokuapp.com/handleauth' : 'http://localhost:3000/handleauth';

// yyo
// var redirect_uri = |'';
var instaCredentials = {
  client_id: process.env.instagram_client_id,
  client_secret: process.env.instagram_client_secret
};

/* Redirect user to Instagram for authenitcation */
router.get('/authorize-user', function (req, res) {
  instaApi.use(instaCredentials);
  res.redirect(instaApi.get_authorization_url(redirect_uri));
});

/* Set cookie once Instagram sends access code */
router.get('/handleauth', function (req, res) {

  instaApi.authorize_user(req.query.code, redirect_uri, function(err, result) {
    // console.log("RESULT:", result);
    if (err) {
      console.log(err.body);
    } else {
      res.cookie('instaToken',result.access_token, { httpOnly: true }); //maxAge: 90000,
      res.redirect('/');
    }
  });
});

/* Index page */
router.get('/', function (req, res) {

  var instaToken = req.cookies.instaToken;

  // console.log(req.cookies.instaToken)

  if (req.cookies.instaToken) {
    instaApi.use({ access_token: instaToken });
    return instaApi.user_self_media_recentAsync(50)
    .spread(function (medias, pagination, remaining, limit) {

      return Bluebird.all([
        instaApi.mediaAsync(medias[Math.floor(Math.random() * medias.length -1) + 1].id),
        instaApi.mediaAsync(medias[Math.floor(Math.random() * medias.length -1) + 2].id),
        instaApi.mediaAsync(medias[Math.floor(Math.random() * medias.length -1) + 3].id)
      ]);
    })
    .spread(function (image1, image2, image3) {
      res.format({
        json: function(){
          res.send({
            image1: image1[0].images.standard_resolution.url,
            image2: image2[0].images.standard_resolution.url,
            image3: image3[0].images.standard_resolution.url,
          });
        },
        html: function(){
          res.render('insta', {
            title: 'Send this Postcard',
            image1: image1[0].images.standard_resolution.url,
            image2: image2[0].images.standard_resolution.url,
            image3: image3[0].images.standard_resolution.url,
            access_token: instaToken,
            stripeKey: process.env.stripe_publish_key
          });
        }
      });
    })
    .catch(function (errors) {
      console.log(errors);
    });
  } else {
    res.render('index', { title: 'Instagram + Lob' });
  }
});

router.get('/logout', function(req, res) {
  res.cookie('instaToken', null, { maxAge: 1, httpOnly: true });
  res.redirect('/');
});

  /* Create Postcard and pay with Stripe  */
router.post('/', function(req, res) {
  var stripeToken = req.body.stripeToken;

  // stripe.setApiKey(process.env.stripe_key);
  var charge = stripe.charges.create({
    amount: 0500, // amount in cents
    currency: "usd",
    card: stripeToken,
    description: "Penny Postcard",
    capture: false
  }, function(err, charge) {
    console.log(err);
    console.log(charge);
    if (err && err.type === 'StripeCardError') {
      return res.render('complete', { error: 'Credit card declined.' });
    }else{
      var postcardTemplate = fs.readFileSync(__dirname + '/views/postcard.html').toString();
      return Lob.postcards.create({
        description: 'Postcard job',
        to: {
          name: req.body.name,
          address_line1: req.body.address,
          address_city: req.body.city,
          address_state: req.body.state,
          address_zip: req.body.zip,
          address_country: 'US',
        },
        front: postcardTemplate,
        message: req.body.message,
        data: {
          image1: req.body.image1,
          image2: req.body.image2,
          image3: req.body.image3
        }
      })
      .then(function (results) {
        console.log(results);
        stripe.charges.capture(charge.id, function(err, charge) {
            console.log(err);
            console.log(charge);
            if (err && err.type === 'StripeCardError') {
              return res.render('complete', { error: 'Credit card declined, but enjoy your free postcard.' });
            }else{
              res.render('complete', {
                url: results.url
              });
            }
          });
      })
      .catch(function (errors){
        // res.send(req.body);
        res.render('complete', { error: errors.message });
      });
    }
  });
});

module.exports = router;