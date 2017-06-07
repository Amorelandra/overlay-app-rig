import { Mutations } from 'shared/js/store';

// User stores fields related to the current extension user
// in vuex, and manages updating/accessing those fields.
export default class User {
  constructor(store, client, auth) {
    // channelID holds the numeric id of the channel the user is currently watching.
    this.channelID = auth.channelId;

    // twitchJWT holds the raw JWT response from the Twitch Extension SDK.
    this.twitchJWT = auth.token;

    // twitchOpaqueID is a Twitch generated ID that will uniquely identify this
    // user (if they are logged in), but does not give us access to their
    // Twitch ID.
    this.twitchOpaqueID = auth.userId;

    // twitchID is this viewer's actual Twitch ID. Used to coordinate access to
    // other Twitch services and across the Twitch universe.
    this.twitchID = null;

    // muxyID is this viewer's ID on Muxy. Used to allow configuration and access
    // to Twitch services from Muxy.
    this.muxyID = null;

    // role is the current user's role in the extension. May be one of
    // ['viewer', 'config'].
    this.role = 'viewer';

    // ip is the user's ip address as returned from the `UserInfo` state endpoint.
    this.ip = '';

    // game being played by streamer
    this.game = '';

    // Video Mode default, fullscreen, or theatre
    this.videoMode = 'default';

    // Current Bitrate
    this.bitrate = null;

    // Current Latency
    this.latency = null;

    // If the user has authorized an extension to see their Twitch ID, it will be
    // hidden in the JWT payload.
    this.extractJWTInfo(store, auth.token);

    // Fetch and store inital user info.
    client.getUserInfo()
      .catch((err) => {
        store.commit(Mutations.ERROR, err);
      }).then((resp) => {
        if (resp) {
          if (resp.mapped_user_id) {
            store.commit(Mutations.SET_USER_TWITCH_ID, resp.mapped_user_id);
          }

          if (resp.ip_address) {
            store.commit(Mutations.SET_USER_IP_ADDRESS, resp.ip_address);
          }

          store.state.analytics.sendPageView();
        }
      });
  }

  // extractJWTInfo attempts to parse the provided JWT and persist any found
  // information in store.
  extractJWTInfo(store, jwt) {
    try {
      const splitToken = jwt.split('.');
      if (splitToken.length === 3) {
        const token = JSON.parse(window.atob(splitToken[1]));
        this.role = token.role;
        store.commit(Mutations.SET_USER_ROLE, this.role);
        if (token.user_id) {
          this.twitchID = token.user_id;
          store.commit(Mutations.SET_USER_TWITCH_ID, this.twitchID);
        }
      }
    } catch (err) {
      // Silently fail (enforcement of Twitch ID is done externally).
    }
  }

  // anonymous returns whether or not the current extension user is anonymous.
  // Twitch defines an anonymous user as one who is not logged in to the channel
  // page running this extension, or one who has explicitly opted-out from sharing
  // auth information with this extension.
  anonymous() {
    return !this.twitchOpaqueID || this.twitchOpaqueID[0] !== 'U';
  }

  // updateAuth stores values from a new auth token in the local store.
  updateAuth(store, auth) {
    store.commit(Mutations.SET_USER_TWITCH_JWT, auth.token);
    this.extractJWTInfo(store, auth.token);
  }
}