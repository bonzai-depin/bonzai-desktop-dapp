import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {authorizeMailbox,mailAuthorizationConfig} from '../src/main/connectors/mailAuthorization.js';

test('desktop mailbox authorization uses PKCE, rejects foreign callbacks and verifies mailbox access',async()=>{
  for(const kind of ['gmail','outlook_mail','google_calendar']) {
    let authorization,callback,requests=[];
    const value=await authorizeMailbox({kind,clientId:'desktop-test',fetcher:async(url,input)=>{
      requests.push(url);
      if(url===mailAuthorizationConfig(kind).token) {
        const params=new URLSearchParams(input.body);
        assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));
        assert.equal(params.get('redirect_uri'),authorization.searchParams.get('redirect_uri'));
        return {ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600})};
      }
      assert.equal(input.headers.Authorization,'Bearer test-access');
      return {ok:true,json:async()=>kind === 'google_calendar' ? {items:[{primary:true,id:'test@example.invalid'}]} : {emailAddress:'test@example.invalid',mail:'test@example.invalid'}};
    },openExternal:async url=>{
      authorization=new URL(url);
      assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
      assert.doesNotMatch(url,/client_secret|test-access/);
      const target=new URL(authorization.searchParams.get('redirect_uri'));
      assert.equal(target.hostname,kind === 'outlook_mail' ? 'localhost' : '127.0.0.1');
      const bad=await fetch(target+'?state=forged&code=test');assert.equal(bad.status,400);
      target.searchParams.set('state',authorization.searchParams.get('state'));target.searchParams.set('code','test');
      callback=fetch(target).then(r=>r.text());
    }});
    assert.equal(value.account,'test@example.invalid');
    assert.equal(value.credential.refreshToken,'test-refresh');
    assert.match(await callback,/connected/);
    if(kind==='outlook_mail')assert.ok(requests.some(url=>url.includes('/me/messages')));
  }
});

test('cancelling sign-in closes the local listener without exchanging credentials',async()=>{
  const controller=new AbortController();let redirect;
  await assert.rejects(authorizeMailbox({kind:'gmail',clientId:'test',signal:controller.signal,fetcher:()=>assert.fail('No token exchange after cancel'),openExternal:async url=>{
    redirect=new URL(url).searchParams.get('redirect_uri');controller.abort();
  }}),/cancelled/);
  await assert.rejects(fetch(redirect));
});
