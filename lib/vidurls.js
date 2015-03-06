'use strict';

module.exports.route = function (rest) {
  rest.get('/vids/:id', function (req, res) {
    var id = req.params.id
      ;

    if ('who-am-i' === id || 'who-are-you' === id) {
      // The 'A' is for Awesome
      res.redirect('https://www.youtube.com/embed/ZWIN9GRJw4Y');
    } else if ('why-im-doing-this' === id || 'why-am-i-doing-this' === id || 'why-are-you-doing-this' === id) {
      // The 'J' is for Just Doing My Thing
      res.redirect('https://www.youtube.com/embed/WAEProuaMyY');
    } else {
      // built-with-love
      if (Math.random() > 0.5) {
        // Expressions of Love
        res.redirect('http://www.youtube.com/watch?v=hkOnH36S_pY');
      } else {
        // Come unto Christ
        res.redirect('http://www.youtube.com/watch?v=ubIP8R5-6Tw');
      }
    }
    res.redirect();
  });
};
