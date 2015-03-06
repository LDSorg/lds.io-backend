The story, evolved:
---

I am a new user to foobar.com
I choose to connect with facebook
The client gets my session and sees that there is no associated account
The client asks me if I would like to associate with another login or create a new account
The client asks me for details necessary to create a local login (which is required for an account)
  and also an account
The client creates my local login and then creates my account
The client associates my facebook with my new account

Sequence A
---

I go to the account page and click connect with twitter

Sequence B
---

I logout of foobar.com
I click connect with twitter
My account is not yet associated with twitter, so I am asked to associate or create a new account
This time I choose to associate and I click facebook.
I am logged in with facebook and the client then links my twitter to my account
that is the primary account for facebook


TODOs
---

  * If I'm trying to create an account, sign me in if the creds match.
  * If I'm trying to log in, ask me if I want to create an account if the username doesn't exist
  * Don't automatically create accounts for logins
