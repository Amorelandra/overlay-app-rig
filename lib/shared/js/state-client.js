import _ from 'lodash';
import XMLHttpRequestPromise from 'xhr-promise';

import Globals from 'shared/js/globals';
import { Mutations } from 'shared/js/store';

// EBS_URL is the backend state url used to store and access persistent
// extension state.
const EBS_URL = 'https://ext.muxy.io';

// ServerState enum maps the subsets of state persisted to the server to
// their respective endpoints.
const ServerState = {
  AUTHENTICATION: 'authentication',
  USER: 'user_info',
  VIEWER: 'viewer_state',
  CHANNEL: 'channel_state',
  EXTENSION: 'extension_state',
  ALL: 'all_state'
};

// errorPromise wraps a string error response in an (immediately rejected)
// promise
function errorPromise(err) {
  return Promise.reject(err);
}

// parseJSONObject attempts to parse all keys in obj, recursively.
function parseJSONObject(obj) {
  return _.mapValues(obj, (v) => {
    try {
      let o = JSON.parse(v);
      if (_.isObject(o)) {
        o = parseJSONObject(o);
      }
      return o;
    } catch (err) {
      return v;
    }
  });
}

// Client wraps all state requests (GET/POST) to the extension backend service.
class Client {
  constructor(store, extID, token, twitchID) {
    this.extensionID = extID;
    this.token = token;
    this.twitchID = twitchID;

    this.loaded = new Promise((resolve, reject) => {
      if (!this.validateJWT()) {
        reject('Your authentication token has expired.');
      } else {
        this.getState()
          .catch(() => {
            reject('Timed out getting extension state.');
          }).then((state) => {
            store.commit(Mutations.UPDATE_VIEWER_OPTIONS, state.viewer);
            store.commit(Mutations.UPDATE_CHANNEL_OPTIONS, state.channel);
            store.commit(Mutations.UPDATE_EXTENSION_OPTIONS, state.extension);

            resolve();
          });
      }
    });

    // Watch for an updated JWT for backend requests
    store.watch(state => state.user.twitchJWT, (newToken) => {
      this.token = newToken;
    });
  }

  // signedRequest checks that we have a valid JWT and wraps a standard AJAX
  // request to the EBS with valid auth credentials.s
  signedRequest(method, endpoint, data) {
    if (!this.validateJWT()) {
      return errorPromise('Your authentication token has expired.');
    }

    return new Promise((resolve, reject) => {
      const xhrPromise = new XMLHttpRequestPromise();
      xhrPromise.send({
        method,
        url: `${EBS_URL}/${endpoint}`,
        headers: {
          'X-Muxy-GDI-AWS': `${this.extensionID} ${this.token}`
        },
        processData: false,
        data
      }).catch(() => {
        reject();
      }).then((resp) => {
        if (resp.status < 400) {
          resolve(parseJSONObject(resp.responseText));
        }

        reject(resp.responseText);
      });
    });
  }


  // signedTwitchRequests wraps an AJAX request to Twitch's kraken API.
  signedTwitchRequest(method, endpoint, data) {
    return new Promise((resolve, reject) => {
      const xhrPromise = new XMLHttpRequestPromise();
      return xhrPromise.send({
        method,
        url: `https://api.twitch.tv/kraken/${endpoint}`,
        headers: {
          Accept: 'application/vnd.twitchtv.v5+json',
          'Client-ID': this.extensionID
        },
        data
      }).catch(() => {
        reject();
      }).then((resp) => {
        if (resp.status < 400) {
          resolve(parseJSONObject(resp.responseText));
        }

        reject(resp.responseText);
      });
    });
  }

  // validateJWT ensures that the current JWT is valid and not expired.
  validateJWT() {
    try {
      const splitToken = this.token.split('.');
      if (splitToken.length !== 3) {
        return false;
      }

      const tk = JSON.parse(window.atob(splitToken[1]));
      if (!tk.exp) {
        return false;
      }

      const now = (new Date()).valueOf();
      if (tk.exp < now / 1000) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  // getState requests a subset of state stored on the server and sets the
  // local cached version of the state to the response.
  getState = substate => this.signedRequest('GET', substate || ServerState.ALL)

  // postState sends data to the corrent EBS substate endpoint for persistence.
  postState = (substate, data) => this.signedRequest('POST', substate || ServerState.ALL, data)

  // NOTE: Simplifying this function seems to prevent overriding with MOCK_DATA below.
  getAuthenticationToken() {
    return this.getState(ServerState.AUTHENTICATION);
  }

  getTwitchStreamInfo = () => this.signedTwitchRequest('GET', `streams/${this.twitchID}`)

  getUserInfo = () => this.getState(ServerState.USER)
  getViewerState = () => this.getState(ServerState.VIEWER)
  getChannelState = () => this.getState(ServerState.CHANNEL)
  getExtensionState = () => this.getState(ServerState.EXTENSION)

  setViewerState = state => this.postState(ServerState.VIEWER, JSON.stringify(state))
  setChannelState = state => this.postState(ServerState.CHANNEL, JSON.stringify(state))

  getAccumulation = (id, start) => this.signedRequest('GET', `accumulate?id=${id}&start=${start}`)
  accumulate = (id, data) => this.signedRequest('POST', `accumulate?id=${id}`, JSON.stringify(data))

  vote = (id, data) => this.signedRequest('POST', `voting?id=${id}`, JSON.stringify(data))
  getVotes = id => this.signedRequest('GET', `voting?id=${id}`)

  rank = data => this.signedRequest('POST', 'rank', JSON.stringify(data))
  getRank = () => this.signedRequest('GET', 'rank')
  deleteRank = () => this.signedRequest('DELETE', 'rank')
}

if (Globals.MOCK_DATA) {
  Client.prototype.signedRequest = (method, endpoint, data) =>
    new Promise((resolve, reject) => {
      switch (method) {
        case 'GET':
          resolve(parseJSONObject(localStorage.getItem(endpoint)));
          break;
        case 'POST':
          localStorage.setItem(endpoint, JSON.stringify(data));
          resolve('ok');
          break;
        default:
          reject(`Unknown request method: ${method}`);
      }
    });

  Client.prototype.getAuthenticationToken = () =>
    new Promise((resolve) => {
      resolve({
        token: `faketoken${new Date().getTime()}`
      });
    });
}

export default Client;