/* currency-manager.js
 * Copyright (c) 2014 Andrew Toth
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the MIT license.
 *
 * Currency manager handles the exchange rate of the currency
 * and the proper formatting of the currency value
 */

var util = require('./util')

var currencyManager = function(preferences) {
    this.preferences = preferences;
};

currencyManager.prototype = {
    getExchangeRate: function(fiatCurrency) {
        return util.getJSON('https://apiv2.bitcoinaverage.com/indices/global/ticker/short?crypto=BTC&fiat=' + fiatCurrency)
    },
    updateExchangeRate: function() {
        this.preferences.getCurrency().then(function(currency) {
            switch (currency) {
                // for BTC and mBTC we don't need to get exchange rate
                // Bit of a hack for BTC. The wallet balance is always stored in BTC
                case 'BTC':
                    return new Promise(function(resolve) { resolve({'dummy': {'averages': {'day': 1}}})}); // hack hack
                case 'mBTC':
                    return new Promise(function(resolve) { resolve({'dummy': {'averages': {'day': 1000}}})}); // hack hack
                default:
                    return util.getJSON('https://apiv2.bitcoinaverage.com/indices/global/ticker/short?crypto=BTC&fiat=' + currency);
            }
        }).then(function(response) {
            this.preferences.setExchangeRate(response[Object.keys(response)[0]]['averages']['day']);
            return response[Object.keys(response)[0]]['averages']['day'];
        }, function(err) {
            return Error(err);
        });
    },
    getSymbol: function() {
        return this.preferences.getCurrency().then(function(currency) {
            switch (currency) {
                // ['Symbol', 'position of symbol before/after', rounding factor false/1-10]
                // case 'BTC':
                //     return(['BTC', 'before', false]); // BTC doesn't really look good in the UI
                case 'mBTC':
                    return(['mBTC', 'before', false]);
                case 'AUD':
                case 'CAD':
                case 'NZD':
                case 'SGD':
                case 'USD':
                    return(['$', 'before', 2]);
                case 'BRL':
                    return(['R$', 'before', 2]);
                case 'CHF':
                    return([' Fr.', 'after', 2]);
                case 'CNY':
                    return(['¥', 'before', 2]);
                case 'EUR':
                    return(['€', 'before', 2]);
                case 'GBP':
                    return(['£', 'before', 2]);
                case 'ILS':
                    return(['₪', 'before', 2]);
                case 'NOK':
                case 'SEK':
                    return([' kr', 'after', 2]);
                case 'PLN':
                    return(['zł', 'after', 2]);
                case 'RUB':
                    return([' RUB', 'after', 2]);
                case 'ZAR':
                    return([' R', 'after', 2]);
                default:
                    return(['$', 'before', 2]);
            }
        });
    },
    getAvailableCurrencies: function() {
        // 'EUR',
        return ['mBTC', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'ILS', 'NOK', 'NZD', 'PLN', 'RUB', 'SEK', 'SGD', 'USD', 'ZAR'];
    },
    amount: function(valueSatoshi) {
        return Promise.all([preferences.getExchangeRate(), this.getSymbol()]).then(function(values) {
            var SATOSHIS = 100000000;
            switch (values[1][0]) {
                case 'BTC':
                    return valueSatoshi / SATOSHIS;
                case 'mBTC':
                    return valueSatoshi / 100000;
                default:
                    return (valueSatoshi / SATOSHIS * values[0]).formatMoney(2);
            }
        });
    },
    formatCurrency: function(value) {
        return Promise.all([this.amount(value), this.getSymbol()]).then(function(results) {
            var symbol = results[1][0],
                beforeOrAfter = results[1][1],
                amount = results[0];
            switch (symbol) {
                // 'BTC' should not be rounded and not formatted like regular fiat.
                case 'BTC':
                    return 'BTC ' + amount;
                case 'mBTC':
                    return 'mBTC ' + amount;
                default:
                    // Format fiat money
                    if ( amount < 0.01 ) { amount = 0 } // We only want to do this Fiat currency.
                    amount = parseFloat(amount);
                    var text = parseFloat(amount.formatMoney(2));
                    if (beforeOrAfter === 'before') {
                        text = symbol + text;
                    } else {
                          text += symbol;
                    }
                    return text;
            }
       });
    },
    formatAmount: function(value) {
        return Promise.all([this.preferences.getExchangeRate(), this.getSymbol()]).then(function(values) {
            var rate = values[0],
                symbol = values[1][0],
                beforeOrAfter = values[1][1],
                SATOSHIS = 100000000,
                amount = (value / SATOSHIS * rate);
            if ( amount < 0.01 ) { amount = 0 }
            var text = amount.formatMoney(2);
            if (beforeOrAfter === 'before') {
                text = symbol + text;
            } else {
                text += symbol;
            }
            return text;
        });
    },
};

Number.prototype.formatMoney = function(c, d, t){
        c = isNaN(c = Math.abs(c)) ? 2 : c;
        d = d == undefined ? "." : d;
        t = t == undefined ? "," : t;
    var n = this,
        s = n < 0 ? "-" : "",
        i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + "",
        j = (j = i.length) > 3 ? j % 3 : 0;
    return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
};

module.exports = currencyManager
