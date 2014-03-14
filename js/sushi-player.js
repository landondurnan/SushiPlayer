/*!
 * Sushi Player 
 * a persistent site-wide audio player using soundmanager2 and soundcloud sdk
 * largely based on: https://github.com/kilokeith/soundcloud-soundmanager-player
 * Author: Landon Durnan
 */

;(function ( $, window, document, undefined ) {

  soundManager.setup({
      url: '/assets/swf/'
    , flashVersion: 9
    , useFlashBlock: false
    , wmode: 'transparent'
    , debugFlash: false
    , debugMode: false
    , preferFlash: false
  });

  "use strict";

  var __slice = [].slice
    , urlregex = new RegExp(/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi);

  function SushiPlayer ( element, options ) {
    this.$element = $(element);
    this.config = $.extend({}, $.fn.sushiplayer.defaults, this.$element.data(), options);
    this.trackURL = this.$element.get(0).href;
    this.permalink = this.$element.data('permalink');
    this.cache = {};
    this.init();
  }

  SushiPlayer.prototype = {

    init : function() {
      var that = this
        , trackURL = this.$element.get(0).href
        , tempURL = ''
        , mp3Track = '';

      this.play_when_ready = false;
      this.cacheEvents();

      // We need to check if the sound is a regular mp3
      if ( trackURL.indexOf('.mp3') > -1 ) {
        tempURL = trackURL.replace(/^.*[\\\/]/, '');
        tempURL = tempURL.substr(0, tempURL.indexOf('mp3')-1 );
        mp3Track = {
          'id': tempURL,
          'title': this.$element.text(), 
          'artwork_url': this.config.artworkurl,
          'download_url': trackURL
        };
        this.showPlayer(mp3Track);
        soundManager.onready( function() { 
          that.createSound(
            { 
              'id': tempURL, 
              'stream_url': trackURL 
            }); 
        });
        that.setCache(tempURL, mp3Track);
      } else {
        this.getTrackData(trackURL, function(track) {
          that.showPlayer(track);
          soundManager.onready(function(){ that.createSound(track); });
          if ( that.config.scrubtype === 'waveform') { that.getWaveform(track); }
        });
      }
    },

    cacheEvents: function() {
      var that = this;

      this.on('sushiplayer.play', function(e, track_id) {
        var $mainPlayer = $('#main-player');

        soundManager.pauseAll();

        // Replace header player with this player if needed
        if ( $mainPlayer.attr('data-track-id') !== track_id ) {
          $mainPlayer.replaceWith( this.$player.clone(true).attr('id', 'main-player') );
        }

      });

      this.on('sushiplayer.track.whileloading', function(e, trackID, percent) {
        $('.audio-player[data-track-id="' + trackID + '"] .sp-scrubber .buffer').css('width', percent + '%');
      });
      
      this.on('sushiplayer.track.whileplaying', function(e, trackID, pos, percent) {
        $('.audio-player[data-track-id="' + trackID + '"] .sp-scrubber .played')
          .css('width', percent + '%')
          .find('.currenttime').text( that.getTrackTime(pos) );
      });

      this.on('sushiplayer.position', function(e, pos) {
        that.playTrack();
      });
    },

    getTrackData: function( url, callback ) {
      var that = this
        , promise = new jQuery.Deferred()
        , permalink = url.replace(/https?\:\/\/soundcloud\.com\/bigsushi\-fm\//gi, "")
        , track = this.getCache( permalink )
        , key = this.config.consumer_key + ''
        , result;
      
      if ( track && callback ) {
        promise.done( function() {
          callback(track);
        }).resolve();
        return promise;
      }
      
      // define a complete condition for the promise
      promise.done( function(track) {
        that.setCache(permalink, track);
        if (callback) callback(track);
      });

      SC.initialize({
        client_id: key
      });

      SC.get('/resolve', { url: url }, function(track) {
        promise.resolve(track);
      });
    },

    setCache: function( url, track ) {
      this.cache[url] = track;
    },

    getCache: function( url ) {
      return this.cache[url] || null;
    },

    showPlayer: function( track ) {
      var that = this
        , playerClass = this.$element.attr('class')
        , playerID = this.$element.attr('id');

      this.$player = $('<div class="audio-player"></div>');

      if ( $('.audio-player[data-track-id="' + track.id + '"]').hasClass('playing') ) {
        playerClass = playerClass + ' playing' ;
      } 

      if ( !this.config.permalink ) { this.config.permalink = track.permalink_url; }

      // Build the player
      this.$player
        .attr('id', playerID)
        .attr('data-track-id', track.id)
        .addClass( playerClass.replace(/sushi-player|hidden/gi, '') )

      if ( this.config.artwork && ( this.config.artworkurl || track.artwork_url ) ) {
        this.$player
          .append( this.config.artwork )
          .find('.sp-artwork')
            .append( '<img src="' + track.artwork_url + '" />' );
      }

      this.$player
        .append( this.config.controls )
        .find('.sp-controls .sp-play')
          .on('click', $.proxy(this.playTrack, this) )
        .end()
        .find('.sp-controls .sp-pause')
          .on('click', $.proxy(this.pauseTrack, this) )
        .end()
        .append( this.config.title )
        .find('.sp-title')
          .append( '<a href="' + this.config.permalink + '">' + track.title + '</a>' )
        .end()
        .find('.sp-title a')
          .on('click', $.proxy(this.viewTrackPage, this) )
        .end()
        .append( this.config.scrubber );
              

      if ( track.duration ) {
        this.$player
          .find('.sp-scrubber .totaltime')
          .text(this.getTrackTime(track.duration));
      }

      this.$element.replaceWith(this.$player);
      
    },

    viewTrackPage: function( e ) {
      if (e) e.preventDefault();      
      History.pushState(null,e.target.title,e.target.href);
    },

    //events - using jquery
    on: function( e, cb ) {
      return $(this).on( e, cb)
    },

    trigger: function( e ){
      var args = (arguments.length > 1) ? __slice.call(arguments, 1) : [];
      return $(this).trigger( e, args );
    },

    createSound: function( track ) {
      var that = this;

      this.sound = soundManager.createSound({
        autoLoad: true
        , id: 'track_' + track.id
        , multiShot: false
        , url: track.stream_url + '?client_id=' + this.config.consumer_key
        , onload: function() {          
          if ( !track.duration ) { 
            track.duration = this.duration;
            that.trackDuration = this.duration;
            that.$player.find('.totaltime').text( that.getTrackTime(this.duration) ); // Backup duration output for mp3
            that.readySeekEvent();
          }
          
          that.ready();
        }
        , whileloading: function() {
          //only whole number percents
          var percent = Math.round(this.bytesLoaded / this.bytesTotal * 100);
          that.trigger('sushiplayer.track.whileloading', track.id, percent);
        }
        , whileplaying: function() {
          //round to nearest 10th of a percent for performance
          var percent = Math.round(this.position / track.duration * 100 * 10) / 10;
          that.trigger('sushiplayer.track.whileplaying', track.id, this.position, percent);
        }
        , onbufferchange: function() {
          // console.log('Buffering '+(this.isBuffering?'started': 'stopped')+'.');
        }
        , onfinish: function() {
          that.destruct();
        }
      });

    },

    getWaveform: function(track) {
      var that = this;

      this.waveform = new Waveform({
        container: this.$player.find('.sp-scrubber').get(0),
        innerColor: "rgba(0, 0, 0, 0.2)",
        width: 600, /* can be done in css if waveform isn't hidden on init */
        height: 100 /* can be done in css if waveform isn't hidden on init */
      });

      // get waveform.js to pull the waveform form the track
      this.waveform.dataFromSoundCloudTrack( track );
      
      //get the waveform update functions back, pass your sweet colors here
      this.waveformUpdater = this.waveform.optionsForSyncedStream({
          playedColor: "rgba(255,  102, 0, 0.8)"
        , loadedColor: "rgba(0, 0, 0, 0.8)"
        , defaultColor: "rgba(0, 0, 0, 0.4)"
      });

      //a little slower than direct, but let the events pass down to the waveform updater
      this.on('sushiplayer.track.whileloading', function(e){
        that.waveformUpdater.whileloading.call(that.sound);
      });
      this.on('sushiplayer.track.whileplaying', function(e){
        that.waveformUpdater.whileplaying.call(that.sound);
      });

    },


    readySeekEvent: function() {
      var that = this;

      this.$player.find('.sp-scrubber').on('mousedown', function(e) {
        e.preventDefault();
        $(this).off('mousemove');
        var relative = that.getMousePosition(e, $(this));
        if ( relative > 0 ) that.seek(that.trackDuration, relative);
      });
    },

    getMousePosition: function( e, $scrubber ) {
      var xpos = e.pageX;
      // Calculate the relative position and make sure it doesn't exceed the buffer's current width.
      return Math.min( $scrubber.find('.buffer').width(), (xpos - $scrubber.offset().left) / $scrubber.width() );
    },

    ready: function() {      
      if ( this.play_when_ready == true ) {
        this.playTrack();
        this.play_when_ready = false;
      }
    },

    playTrack: function(e) {
      if (e) e.preventDefault();

      var track_id = this.$player.attr('data-track-id');

      this.trigger('sushiplayer.play', track_id );

      if ( this.sound && this.sound.readyState == 3 ) {
        soundManager.play( 'track_' + track_id );
        $('.audio-player[data-track-id="' + track_id + '"]').addClass('playing');
      } else {
        // or hold a state to come back to when ready
        this.play_when_ready = true;
      }
      
      return this;
    },

    pauseTrack: function( e ) {
      if (e) e.preventDefault();

      var track_id = this.$player.attr('data-track-id');

      if ( this.sound ) {
        soundManager.togglePause('track_' + track_id );
        $('.audio-player[data-track-id="' + track_id + '"]').removeClass('playing');
      }
      return this;
    },

    stop: function() {
      if ( this.sound ) soundManager.stop('track_' + this.$player.attr('data-track-id'));
      this.trigger('sushiplayer.stop');
      return this;
    },

    seek: function(duration, relative){
      // Calculate a new position given the click's relative position and the track's duration.
      var pos = duration * relative;
      this.trackPos(pos);
      return this;
    },

    trackPos: function( pos ) {
      
      var track_id = $('.audio-player').attr('data-track-id');
      if ( this.sound ) {
        if ( pos || pos === 0) {
          // limit to bounds
          pos = Math.min(this.sound.duration, pos);
          pos = Math.max(0, pos);

          //setter
          this.trigger('sushiplayer.position', pos);
          return this.sound.setPosition(pos);
        } else {
          //getter
          this.trigger('sushiplayer.position', this.sound.position);
          return this.sound.position;
        }
      }
      return 0;
    },

    getTrackTime: function( pos ) {
      var time = pos;
      var ms = time % 1000
        , s = Math.floor((time / 1000) % 60)
        , m = Math.floor((time / (60 * 1000)) % 60)
        , h = Math.floor((time / (60 * 60 * 1000)) % 24);

      var t = this.pad(m) + ':' + this.pad(s);
      if(h > 0) t = h + ':' + t;
      return t;
    },

    // helper utilities
    isNumeric: function(n) {
      return !isNaN(parseFloat(n)) && isFinite(n);
    },

    pad: function(num) {
      return (num < 10 ? '0' : '') + num;
    }

  };

  $.fn.sushiplayer = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('sushi-player')
      var options = typeof option == 'object' && option

      if (!data && option == 'destroy') return
      if (!data) $this.data('sushi-player', (data = new SushiPlayer(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.sushiplayer.defaults = {
    consumer_key: "83458ced0e5f2532df0c1f60747f77bc",
    permalink: null,
    scrubtype: 'bar',
    artworkurl: null,
    artwork: '<div class="sp-artwork"></div>',
    title: '<div class="sp-title"></div>',
    controls: '<div class="sp-controls"><a href="#play" class="sp-play"><i class="fa fa-play"></i></a> <a href="#pause" class="sp-pause"><i class="fa fa-pause"></i></a></div>',
    scrubber: '<div class="sp-scrubber"><div class="buffer"></div><div class="played"><span class="time currenttime"></span></div><span class="time totaltime"></span></div>'
  }

})( jQuery, window, document );