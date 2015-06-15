if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['./MMOM'], function (MMOM) {
'use strict';

MMOM.Error.prototype.toConsoleString = function () {
    var out = '';

    function add_marked(source, from, to, level, message) {
        var pos = source.lookupPos(from);
        var posr = source.lookupPos(to);
        out += `${source.name}:${pos[0]}:${pos[1]}:${level}: ${message}\n`;
        var line = source.getLine(pos[0]);
        line = line.replace(/\r?\n?$/,'');
        if (posr[0] !== pos[0]) posr = [pos[0],line.length+1];
        if (posr[1] > line.length+1) posr[1] = line.length+1;
        line = line.substring(0,pos[1]-1) + '»' + line.substring(pos[1]-1,posr[1]-1) + (pos[1] === posr[1] ? '' : '«') + line.substring(posr[1]-1);
        out += '|' + line + '\n';
    }

    var me = this; //ES6 arrows
    var infos = [], def = this.definition;
    var msg = def.template.replace(/«([^»]*)»/g, function (m) {
        var spl = m.substring(1,m.length-1).split(':');
        var tag = spl.pop();
        var data = me.data && me.data[spl[0]];
        if (!data) return '';

        switch (tag) {
            case 't':
                return data.toString();
            case 'm':
                return Array.isArray(data) ? data.map(function (dd) { return dd || '...'; }).join(' ') : data;
            case 's':
                return data;
            case 'l':
                infos.push({ loc: data, label: spl[1] });
                return '';
            default:
                return '??';
        }
    });
    if (me.location.statement && me.location.statement.label) msg = '(in '+me.location.statement.label+') '+msg;
    add_marked(me.location.source, me.location.from, me.location.to, (def.options && def.options.warning) ? 'warning' : 'error', msg);
    for (var i of infos) {
        add_marked(i.loc.source, i.loc.from, i.loc.to, 'info', i.label);
    }

    return out;
};

});
