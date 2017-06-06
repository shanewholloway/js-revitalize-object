require('source-map-support').install()

const testModule = require('../dist')

const tap = require('tap-lite-tester')
tap.start()

require('./tap-test-smoke') @ tap
require('./tap-test-basics') @ tap
require('./tap-test-basics-alt') @ tap
require('./tap-test-circular') @ tap

tap.finish()

