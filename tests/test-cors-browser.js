// successful error
$.ajax({
  type: "POST" 
, url: "http://local.ldsconnect.org:4004/api/doesnt-exist?access_token=" + 'Qu82qnjr4FVg8OEfgLJjcKeWKQOHgE0KufPfKv1W01WNw-IVeeHShM4JYssgVVFRcmOpbEXV1I317933ZlcsMXH9zciwL92qTHYgHoeOF5HaERKaAAmJzHCu-Dx4m6qdiZkdT7aTmbfL_4Wr98SfNIlIoIA8GEwm9mkTxK0E6XpndzPvINpjIX9q3NEpXvVi_JqcsIFNFpmLVZjMR4D95F_rtNjGXfjnf4WjFInZYCQ26W4XIdLIbvCsUNCSZW07'
});

// successful get
$.ajax({
  type: "GET"
, url: "http://local.ldsconnect.org:4004/api/tokeninfo?access_token=" + 'Qu82qnjr4FVg8OEfgLJjcKeWKQOHgE0KufPfKv1W01WNw-IVeeHShM4JYssgVVFRcmOpbEXV1I317933ZlcsMXH9zciwL92qTHYgHoeOF5HaERKaAAmJzHCu-Dx4m6qdiZkdT7aTmbfL_4Wr98SfNIlIoIA8GEwm9mkTxK0E6XpndzPvINpjIX9q3NEpXvVi_JqcsIFNFpmLVZjMR4D95F_rtNjGXfjnf4WjFInZYCQ26W4XIdLIbvCsUNCSZW07'
});

// successful error
$.ajax({
  type: "GET"
, url: "http://local.ldsconnect.org:4004/api/tokeninfo"
});
