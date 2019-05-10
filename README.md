# telegram-cloudflare-bot

## Install

First install [node-pty dependencies](https://github.com/Microsoft/node-pty#dependencies). For example, if you're in Ubuntu/Debian:

~~~
sudo apt install -y make python build-essential
~~~

Before using this, you should have obtained an auth token for your bot,
and know your personal user's numeric ID. If you don't know what this
means, check out the [blog post][] for a full step-by-step guide.

~~~
git clone https://github.com/digitalgeneralist/telegram-cloudflare-bot.git && cd telegram-cloudflare-bot
npm install
~~~

To start the bot:

~~~
node server
~~~

The first time you run it, it will ask you some questions and create
the configuration file automatically: `config.json`. You can also
write it manually, see `config.example.json`.

Add manually your Cloudflare API data to `config.json`.
example:
    "zone": "9E82F4732C11EC6672959BD5E36D5",
    "authkey": "175DEC54BBF9B7289FCC62CAC45C6",
    "authemail": "my@mailadress.com"

When started it will print a `Bot ready.` message when it's up and running.
For convenience, you might want to talk to the BotFather and set the
command list to the contents of `commands.txt`.

## Authorization

When first started, the bot will just accept messages coming from your user.
This is for security reasons: you don't want arbitrary people to issue
commands to your computer!

If you want to allow another user to use the bot, use `/token` and give
that user the resulting link. If you want to use this bot on a group,
`/token` will give you a message to forward into the group.

## Proxy server

shell-bot obeys the `https_proxy` or `all_proxy` environment variable
to use a proxy, and supports HTTP/HTTPS/SOCKS4/SOCKS4A/SOCKS5 proxies.
Examples:

~~~ bash
export https_proxy="http://168.63.76.32:3128"
node server

export https_proxy="socks://127.0.0.1:9050"
node server
~~~

**Warning:** For SOCKS proxies, you need to use an IP address (not a DNS hostname).



[Telegram bot]: https://core.telegram.org/bots
[Botgram]: https://botgram.js.org
[blog post]: https://alba.sh/blog/telegram-shell-bot/
