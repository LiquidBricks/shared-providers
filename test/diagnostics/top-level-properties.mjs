import * as loggerConsoleMod from '../../diagnostics/loggers/console.js'
import * as loggerNatsMod from '../../diagnostics/loggers/nats.js'
import * as metricsConsoleMod from '../../diagnostics/metrics/console.js'
import * as metricsNatsMod from '../../diagnostics/metrics/nats.js'
import { testLoggerTopLevel, testMetricsTopLevel } from '../helpers/topLevelProperties.mjs'
testLoggerTopLevel({
  title: 'loggers/console export and shape',
  mod: loggerConsoleMod,
  factoryName: 'createConsoleLogger',
})

testLoggerTopLevel({
  title: 'loggers/nats export and shape',
  mod: loggerNatsMod,
  factoryName: 'createNatsLogger',
  makeOptions: () => ({ natsContext: {} }),
})

testMetricsTopLevel({
  title: 'metrics/console export and shape',
  mod: metricsConsoleMod,
  factoryName: 'createConsoleMetrics',
})

testMetricsTopLevel({
  title: 'metrics/nats export and shape',
  mod: metricsNatsMod,
  factoryName: 'createNatsMetrics',
  makeOptions: () => ({ natsContext: {} }),
})
