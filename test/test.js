require('source-map-support').install()

const testModule = require('../dist')

const tap = require('tap-lite-tester')
tap.start()

require('./tap-test-basics') @ tap

tap.finish()

