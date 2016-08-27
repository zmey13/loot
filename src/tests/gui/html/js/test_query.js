'use strict';

describe('Query', () => {
  describe('#Query()', () => {
    it('should throw if no arguments are passed', () => {
      (() => { new loot.Query(); }).should.throw(); // eslint-disable-line no-new
    });

    it('should initialise cancelled as false', () => {
      const query = new loot.Query('test');

      query.cancelled.should.be.false; // eslint-disable-line no-unused-expressions
    });

    it('should leave the query ID undefined', () => {
      const query = new loot.Query('test');

      should.not.exist(query.id);
    });

    it('should convert the query parameters to a JSON string', () => {
      const query = new loot.Query('foo', 'bar', 'baz');

      query.request.should.equal('{"name":"foo","args":["bar","baz"]}');
    });

    it('should convert empty rest parameters to an empty JSON array', () => {
      const query = new loot.Query('foo');

      query.request.should.equal('{"name":"foo","args":[]}');
    });
  });

  describe('#send()', () => {
    it('should return a promise', () => {
      const query = new loot.Query('test');

      query.send().should.be.a('promise');
    });

    it('should succeed if the query is recognised', () => {
      const query = new loot.Query('discardUnappliedChanges');

      query.send().then((result) => result.should.be.empty);
    });

    it('should succeed if a query with arguments is recognised', () => {
      const query = new loot.Query('copyContent', 'foo');

      query.send().then((result) => result.should.be.empty);
    });

    it('should fail with an Error object when an error occurs', () => {
      const query = new loot.Query('copyContent');

      query.send().catch((error) => error.should.be.an('error'));
    });

    it('should set the query id', () => {
      const query = new loot.Query('discardUnappliedChanges');

      query.send();

      should.exist(query.id);
    });
  });

  describe('#cancel()', () => {
    it('should not cancel the request if the request has not been sent', () => {
      const query = new loot.Query('discardUnappliedChanges');

      query.cancel();

      query.cancelled.should.be.false; // eslint-disable-line no-unused-expressions
    });

    it('should cancel the request if the request has been sent', (done) => {
      const query = new loot.Query('discardUnappliedChanges');

      const result = query.send();
      query.cancel();

      query.cancelled.should.be.true; // eslint-disable-line no-unused-expressions
      result.catch((error) => {
        should.not.exist(error);
        done();
      });
    });
  });

  describe('#send() [static]', () => {
    it('should throw if no arguments are passed', () => {
      (() => { loot.Query.send(); }).should.throw();
    });

    it('should return a promise', () => {
      loot.Query.send('test').should.be.a('promise');
    });

    it('should succeed if a request name is passed', () =>
      loot.Query.send('discardUnappliedChanges').then((result) =>
        result.should.be.empty
      )
    );

    it('should succeed if a request name and arguments are passed', () =>
      loot.Query.send('copyContent', 'foo').then((result) =>
        result.should.be.empty
      )
    );

    it('should fail with an Error object when an error occurs', () =>
      loot.Query.send('copyContent').catch((error) =>
        error.should.be.an('error')
      )
    );
  });
});
