const express = require('express')
const session = require('express-session')
const cookieParser = require('cookie-parser')
const Twitter = require('twitter')
const config = require('./config')

const {
  getOAuthRequestToken,
  getOAuthAccessTokenWith,
  oauthGetUserById
} = require('./oauth-utilities')

const path = require('path')
const fs = require('fs')
const TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'web-app/src', 'index.html'), { encoding: 'utf8' })

main()
  .catch(err => console.error(err.message, err))

async function main () {
  const app = express()
  app.use(cookieParser())
  app.use(session({ secret: 'secret' }))

  app.listen(3080, () => console.log('listening on http://127.0.0.1:' + 3080))


  // Get latest tweets, filtered by user id
  app.get('/api/twitter/tweets', async (req, res, next) => {
    var T = new Twitter(config);
    // Set up search parameters
    var params = {
      q: 'srest_com',
      count: 10,
      result_type: 'recent',
      lang: 'en'
    }
    // Initiate your search using the above paramaters
    T.get('search/tweets', params, function(err, data, response) {
      // If there is no error, proceed
      if(!err){
        res.status(200).json(data)
      } else {
        console.log(err);
        return res.status(500).json({
          error: "Failed to get tweets",
          message: err,
        })
      }
    })
  })

  // Test method
  app.get('/api/login', async (req, res, next) => {
    console.log('/api req.cookies', req.cookies)
    //This need to happen in twitter callback, local testing
    req.session.twitter_screen_name = config.userid
    res.cookie('twitter_screen_name', config.userid, { maxAge: 900000, httpOnly: true })
    res.redirect('http://localhost:4200/api/user');
  })

  // Not production ready
  app.get('/api/user', async (req, res, next) => {
    console.log('/api req.cookies', req.cookies)
    if(req.session.twitter_screen_name) {
      return res.send(TEMPLATE.replace('unauthorized', `
      <app-root></app-root>
      <script src="runtime.js" type="module"></script>
      <script src="polyfills.js" type="module"></script>
      <script src="styles.js" type="module"></script>
      <script src="vendor.js" type="module"></script>
      <script src="main.js" type="module"></script>
    `))
    }
  })

  app.get('/api/twitter/logout', logout)
  function logout (req, res, next) {
    res.clearCookie('twitter_screen_name')
    req.session.destroy(() => res.redirect('/'))
  }

  app.get('/api/twitter/authorize', twitter('authorize'))
  function twitter (method = 'authorize') {
    return async (req, res) => {
      console.log(`/api/twitter/${method}`)
      const { oauthRequestToken, oauthRequestTokenSecret } = await getOAuthRequestToken()
      console.log(`/api/twitter/${method} ->`, { oauthRequestToken, oauthRequestTokenSecret })
      req.session = req.session || {}
      req.session.oauthRequestToken = oauthRequestToken
      req.session.oauthRequestTokenSecret = oauthRequestTokenSecret
      const authorizationUrl = `https://api.twitter.com/oauth/${method}?oauth_token=${oauthRequestToken}`
      console.log('redirecting user to ', authorizationUrl)
      res.redirect(authorizationUrl)
    }
  }

  //It returns in format
  /// ?oauth_token=atATLQAAAAABLHy-AAABdswOkM8&oauth_verifier=d5WF2BUV979lVdwiykfQnGF459BJwgVN,  oauthRequestTokenSecret: 'FTTbclfcEpShRScMDSL5ckmN3A7AQbBV'
  app.get('/api/twitter/callback', async (req, res) => {
    const { oauthRequestToken, oauthRequestTokenSecret } = req.session
    const { oauth_verifier: oauthVerifier } = req.query
    console.log('/api/twitter/callback', { oauthRequestToken, oauthRequestTokenSecret, oauthVerifier })
    const { oauthAccessToken, oauthAccessTokenSecret, results } = await getOAuthAccessTokenWith({ oauthRequestToken, oauthRequestTokenSecret, oauthVerifier })
    req.session.oauthAccessToken = oauthAccessToken
    const { user_id: userId /*, screen_name */ } = results
    const user = await oauthGetUserById(userId, { oauthAccessToken, oauthAccessTokenSecret })
    req.session.twitter_screen_name = user.screen_name
    res.cookie('twitter_screen_name', user.screen_name, { maxAge: 900000, httpOnly: true })
    console.log('user succesfully logged in with twitter', user.screen_name)
    req.session.save(() => res.redirect('/api/user'))
  })
}
