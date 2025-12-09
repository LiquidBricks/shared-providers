
/* 
todo: implement this as a unit test. im creating a new router()
the routes.request should take a dot seperated string(subject) and payload (request)
router should take a schema which defines each ordinal token of the dot seperated subject, and place its value as param[schema[0]]=subject[0] etc.
*/
const routes = router({
  tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
  context: {},
})
  .route({ entity: 'component' }, {
    children: [[
      { channel: 'cmd' }, {
        pre: [
          requireData()
        ],
        children: [[
          { action: 'register' }, {
            handler: () => console.log('componentRegisterCommand')
          }
        ]]
      }
    ], [
      { channel: 'evt', action: 'registered' }, {
        handler: () => console.log('componentEvent')
      }
    ]]
  })
  .route({ entity: 'componentInstance', channel: 'cmd' }, {
    handler: () => console.log('componentInstanceCommand')
  })
  .route({ entity: 'componentInstance', channel: 'evt' }, {
    handler: () => console.log('componentInstanceEvent')
  })

routes.request({ subject: 'prod.cs._._.' })
