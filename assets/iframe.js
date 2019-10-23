/* globals io:false, data:false */

(function () {
  // give up and resort to `target=_blank`
  // if we're not modern enough
  if (!document.body.getBoundingClientRect
   || !document.body.querySelectorAll
   || !window.postMessage) {
    return
  }

  // the id for the script we capture
  var id

  // listen on setup event from the parent
  // to set up the id
  window.addEventListener('message', function onmsg(e) {
    if (/^slackin:/.test(e.data)) {
      id = e.data.replace(/^slackin:/, '')
      document.body.addEventListener('click', function (ev) {
        var el = ev.target
        while (el && el.nodeName != 'A') el = el.parentNode
        if (el && el.target === '_blank') {
          ev.preventDefault()
          window.parent.postMessage('slackin-click:' + id, '*')
        }
      })
      window.removeEventListener('message', onmsg)

      // notify initial width
      refresh()
    }
  })

  // notify parent about current width
  var button = document.querySelector('.slack-button')
  var lastWidth
  function refresh() {
    var width = button.getBoundingClientRect().width
    if (window != window.top && window.postMessage) {
      var but = document.querySelector('.slack-button')
      width = Math.ceil(but.getBoundingClientRect().width)
      if (lastWidth !== width) {
        lastWidth = width
        window.parent.postMessage('slackin-width:' + id + ':' + width, '*')
      }
    }
  }

  // initialize realtime events asynchronously
  var script = document.createElement('script')
  script.src = 'https://cdn.socket.io/socket.io-1.4.4.js'
  script.onload = function () {
    // use dom element for better cross browser compatibility
    var url = document.createElement('a')
    url.href = window.location
    var socket = io({ path: data.path + 'socket.io' })
    var count = document.getElementsByClassName('slack-count')[0]

    socket.on('data', function (users) {
      for (var i in users) update(i, users[i])
    })
    socket.on('total', function (n) { update('total', n) })
    socket.on('active', function (n) { update('active', n) })

    var anim
    function update(key, n) {
      if (data[key] != n) {
        data[key] = n
        var str = ''
        if (data.active) str = data.active + '/'
        if (data.total) str += data.total
        if (!str.length) str = '–'
        if (anim) clearTimeout(anim)
        count.innerHTML = str
        count.className = 'slack-count anim'
        anim = setTimeout(function () {
          count.className = 'slack-count'
        }, 200)
        refresh()
      }
    }
  }
  document.body.appendChild(script)
}())
