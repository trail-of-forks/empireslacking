'use strict';

const { EventEmitter } = require('events');
const { WebClient } = require('@slack/web-api');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class SlackData extends EventEmitter {
  constructor({ token, interval, logger, pageDelay, fetchChannels, org: host }) {
    super();
    this.host = host;
    this.interval = interval;
    this.pageDelay = pageDelay;
    this.fetchChannels = fetchChannels;
    this.ready = false;
    this.org = {};
    this.users = {};
    this.channelsByName = {};
    if (logger) {
      this.bindLogs(logger);
    }
    this.slackClient = new WebClient(token);

    this.init();
    this.fetchUserCount();
  }

  async init() {
    this.emit('fetch', 'team');
    this.slackClient.team.info().then((res) => {
      const { team } = res;
      if (!team) {
        throw new Error('Bad Slack response. Make sure the team name and API keys are correct');
      }

      this.org.name = team.name;
      if (!team.icon.image_default) {
        this.org.logo = team.icon.image_132;
      }
      });

    if (this.fetchChannels) {
      try {
        this.channelsByName = {};

        for await (const page of this.webClient.paginate('conversations.list', { limit: 800 })) {
          if (!page.ok) {
            this.emit('error', new Error(`Slack API error: ${page.error}`));
            return this.retry();
          }

          if (!Array.isArray(page.channels)) {
            this.emit('error', new Error('Invalid Slack response: channels is not an array'));
            return this.retry();
          }

          page.channels.forEach((channel) => {
            this.channelsByName[channel.name] = channel;
          });
        }
      } catch (error) {
        this.emit('error', error);
        return this.retry();
      }
    }
  }

  async fetchUserCount() {
    let users = [];

    for await (const page of this.webClient.paginate('users.list')) {
      if (!page.ok) {
        this.emit('error', new Error(`Slack API error: ${page.error}`));
        return this.retry();
      }

      if (!Array.isArray(page.members)) {
        this.emit('error', new Error('Invalid Slack response: members is not an array'));
        return this.retry();
      }

      users = [...users, ...page.members];

    };

    // remove slackbot and bots from users
    // slackbot is not a bot, go figure!
    users = users.filter((x) => x.id !== 'USLACKBOT' && !x.is_bot && !x.deleted);

    const total = users.length;
    const active = users.filter((user) => user.presence === 'active').length;

    if (this.users) {
      if (total !== this.users.total) {
        this.emit('change', 'total', total);
      }

      if (active !== this.users.active) {
        this.emit('change', 'active', active);
      }
    }

    this.users.total = total;
    this.users.active = active;

    if (!this.ready) {
      this.ready = true;
      this.emit('ready');
    }

    setTimeout(this.fetchUserCount.bind(this), this.interval);
    return this.emit('data');
  }

  getChannelId(name) {
    const channel = this.channelsByName[name];
    return channel ? channel.id : null;
  }

  retry(delay = this.interval * 2) {
    setTimeout(this.fetchUserCount.bind(this), delay);
    return this.emit('retry');
  }

  bindLogs(logger) {
    this.on('error', (err) => logger('Error: %s', err.stack));
    this.on('retry', () => logger('Attempt failed, will retry'));
    this.on('fetch', (type) => logger('Fetching %s data from Slack', type));
    this.on('ready', () => {
      logger('Slack is ready');
      if (!this.org.logo) {
        logger('Error: No logo exists for the Slack organization.');
      }
    });
    this.on('data', () => logger(
      'Got data from Slack: %d online, %d total',
      this.users.active, this.users.total,
    ));
  }
}

module.exports = SlackData;
