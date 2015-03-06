'use strict';

function getImgUrl(url) {
  return 'http://images.coolaj86.com/api/resize/width/100?url=' + url;
}

module.exports = {
  "gizmo": {
    title: "Gizmo"
  , short: "High Capacity Gizmo"
  , desc: "One of thems doodad doohickeys that do stuff"
  , amount: 37
  , imgsrc: getImgUrl("http://www.reenigne.org/photos/2004/4/doodads.jpg")
  }
, "sprocket": {
    title: "Sprocket"
  , short: "Sprocket (Model-M)"
  , desc: "Replacement sprocket for all model M gadgets and gizmos"
  , amount: 1197
  , imgsrc: getImgUrl("http://2.imimg.com/data2/VR/DH/MY-1977734/tvs-xl-super-h-duty-250x250.jpg")
  }
, "doohickey": {
    title: "Doohickey"
  , desc: "Model S doohickey - includes all 6-series thing-a-mobobs and -majigs."
  , amount: 3897
  , imgsrc: getImgUrl("http://img.izismile.com/img/img6/20131102/640/awesome_musthave_gizmos_and_gadgets_640_18.jpg")
  }
, "whatchamacallit": {
    title: "Whatchamacallit"
  , desc: "Useful for mind control, air bending, etc. iThink compatible"
  , amount: 699997
  , imgsrc: getImgUrl("http://cdn.trendhunterstatic.com/thumbs/next-hot-gizmo-apple-ithink-concept-underway.jpeg")
  }
, "newfangled": {
    title: "Newfangled!"
  , desc: "All of the latest news about the hottest swag."
  , amount: 550
  , period: 'month'
  , periodly: 'monthly'
  , imgsrc: getImgUrl("http://www.jaimecalayo.com/sda/website/images/index_newfangled.jpg")
  }
, "deposit": {
    title: "Gig Booking Deposit"
  , desc: "Non-refundable Deposit."
  }
};
