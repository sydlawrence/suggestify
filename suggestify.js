/**
  * Copyright (C) 2011  Syd Lawrence (sydlawrence@gmail.com)
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  * 
  * THIS SOFTWARE AND DOCUMENTATION IS PROVIDED "AS IS," AND COPYRIGHT
  * HOLDERS MAKE NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED,
  * INCLUDING BUT NOT LIMITED TO, WARRANTIES OF MERCHANTABILITY OR
  * FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE
  * OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS,
  * COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.COPYRIGHT HOLDERS WILL NOT
  * BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL OR CONSEQUENTIAL
  * DAMAGES ARISING OUT OF ANY USE OF THE SOFTWARE OR DOCUMENTATION.
  * 
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <http://gnu.org/licenses/>.
  */

var i18n = {
    default: "en",
    current: "en",
    get:function(str) {
        var ret = this[this.current][str];
        if (ret) return ret;
        else return "i18n."+this.current+"."+str;
    },

    en: {
        loading: "Suggestify gremlins are working away",
        offline: "<h2>Sorry! I can't call the mother ship as you appear to be offline.</h2><p>When you go back online, I can recommend some more songs.</p>",
        noSuggestions: "<h2>Sorry! I can't suggest any songs for the artist: :artist.</h2><p>To be honest, I have never heard of them before. I hope they are pretty good :)</p><p>When I can recommend some more songs, I'll let you know here!</p>",
        noTrack: "<h2>Sorry! I can't suggest any songs as there is no current track being played.</h2><p>When I can recommend some more songs, I'll let you know here!</p>"
    }
}

i18n.current = i18n.default;

// get the standard spotify apis
var sp = getSpotifyApi(1);
var m = sp.require('sp://import/scripts/api/models');
var v = sp.require('sp://import/scripts/api/views');
var ui = sp.require("sp://import/scripts/ui");
var player = m.player,
library = m.library,
application = m.application,
playerImage = new v.Player();


// trackety track, I am a gremlin
var googletracker = sp.require("sp://import/scripts/googletracker")
var tracker = new googletracker.GoogleTracker("UA-19804545-13");
tracker.track("app");

// config global variables... yeah you heard me... global variables... it's how i roll
    
var echoNestAPIKey = "GPQCPTGUIZ43M2FSV",   // replace this key with your own
    timerThreshold = 2000;                  // how long before the end of the track do we skip... this is due to no onended event

// just some random variables i need throughout the app. that's right... they are global vars, what withit?
var tracksPlayed = {},      // just so we don't get caught in a loop of playing the same song over and over
    autoPlay = false,       // global var for if we are on autoplay or not
    searching = false,  
    displayCount = 0,       // how many are currently on screen
    checkTimer = undefined, // this is tocheck for end of track as there is no sensible onended event
    paused = false;         // just to stop multiple tracksbeing played at once

// check to see if track has recently been plated
function checkRecentPlays(track) {
    if (tracksPlayed[track.uri])
        return true;
    return false;
}

// clear recent tracks
function clearRecentTracks() {
    tracksPlayed = {};
}

// set auto play on or off
function setAutoPlay(value) {
    if (value === "false") value = false; // localstorage stores false as string

    if (value) { // is set to autoplay, 

        // track this movement
        tracker.track("app/autoplay/on");

        // modify the ui
        $('#autoplay').removeClass("noautoplay").addClass("autoplay").html("Autoplay on");
        $('#results li').first().addClass("first");

    } else {

        // all your base belong to us
        tracker.track("app/autoplay/off");

        // modify the ui
        $('#autoplay').removeClass("autoplay").addClass("noautoplay").html("Autoplay off");
        $('#results li.first').removeClass("first");
    }

    // store it in local storage to retreve in future
    window.localStorage['autoPlay'] = value;

    // finally set the global var
    autoPlay = value;

}

// simply refresh the list
function refresh() {
    getCurrentlyPlaying();
}

function renderMainTrack(track) {
    var playing = $('#currentlyPlaying');
    if (!track) {
        playing.hide();
        return;
    }
      
    // setup the display block
    playing.show();
    playing.find("a.track").attr('href',track.uri);
    window.track = track;

    playing.find(".image").css('background','url('+track.data.album.cover+')');
    playing.find(".title").html(track.name);

    // find the artist span
    var $artist = playing.find(".artist").html("");

    // insert all the artists
    for (var i = 0; i<track.artists.length;i++) {
        if (i > 0)
            $artist.append(", ");

        // link to them all as requested in the docs
        $artist.append("<a href='"+track.artists[0].uri+"'>"+track.artists[0].name+"</a>")

    }
}

// get the track that is currently playing
function getCurrentlyPlaying() {
    // refreshing
    searching = true;
    displayCount = 0;

    // get the current track from the player
    var currentTrack = m.player.track;
    
    $('#currentlyPlaying').removeClass("user-selected");    
    renderMainTrack(currentTrack);
    console.log(currentTrack);

    // if nothing currently playing
    if (currentTrack == null || currentTrack.data.isAd === true) {
        noTrackPlaying();
    }

    // winner we have a track
    else {
        isTrackPlaying();

        // get the trackand the artist
        var track = currentTrack.data;
        var artist = track.artists[0].name;

        // add to history
        tracksPlayed[track.uri] = track;

        // fetch suggestions
        fetchSuggestions(artist, 50);
    }
}

// play a track in the player
function playTrack(track) {
    tracker.track("app/track/play/"+track.uri);
    setAutoPlay(true);

    // play the track from it's uri, here you can pass the whole track object, but it will switch to album view away from the app
    m.player.play(track.uri);
}

// render the track 
function renderTrack(track) {

    // check track isn't already playing
    if (m.player.track && m.player.track.data.uri === track.data.uri) {
        return;
    }
    if (!searching)
        return;

    // hiding the loading div
    $("#results .loading").remove();

    // create a list element
    var li = $("<li/>");

    // if first list item and autoplay
    if (displayCount === 0 && autoPlay)
        li.addClass("first");

    var t = track;
    // legacy
    track = track.data;
    
    // this is the spotify view object, hopefully can replace my image with it
    //var view = new v.Track(t,v.Track.FIELD.TRACK); 
    
     var img =  $("<div class='cover'>"+
                    "<span class='playerView'></span>"+
                        "<span class='title'>"+track.name+"</span>"+
                        "<span class='artist'></span>"+
                "</div>");
    
    var playerView = new v.Player();


    /* Create a temporary playlist for the song */
    var playlist = new m.Playlist();
    playlist.add(t);
    playerView.track = null; // Don't play the track right away
    playerView.context = playlist;
    //playerView._context.data.uri = track.album.uri;
    console.log(playerView);

    img.data("uri",track.album.uri);
    img.find('.playerView').append(playerView.node);

    // find the artist span
    var $artist = img.find(".artist");

    // insert all the artists
    for (var i = 0; i<track.artists.length;i++) {
        if (i > 0)
            $artist.append(", ");

        // link to them all as requested in the docs
        $artist.append("<a href='"+track.artists[0].uri+"'>"+track.artists[0].name+"</a>")

    }


    // add this to the list item
    li.append(img);

    // add the list item to the results
    $("#results").append(li);


    // 1 more has been rendered
    displayCount++
}

// using artist name and song name, find the spotify track
function fetchSpotifyTrack(artist,song) {

    // this is the query string
    var query = artist + " " + song;

    // we have a spotify track, but what shall we do with it?
    function parseTrack(track) {
        var t = track;
        track = track.data;

        // may be an album
        if (track.type === "track") {

            // check that the artist name is the same
            if (track.artists && track.artists[0].name.indexOf(artist) >= 0) {
                
                // check that the track name is the same
                if (track.name.indexOf(song) >= 0) {

                    // don't forget not all songs are available everywhere
                    if (checkRegion(track) && !checkRecentPlays(track)) {

                        // set as stored for future help
                        window.localStorage[query] = track.uri;

                        // display this bad boy
                        renderTrack(t);

                        // we no longer what to loop
                        return true
                    }
                }
            }
        } else {
            console.log(t);

        }
        return false;
    }
    /*
    // have we have found info on this before?
    if (window.localStorage[query]) {

        // damn straight we have, well we no longer need to search spotify for it
        var track = m.Track.fromURI(window.localStorage[query]);
        parseTrack(track);
        return;
    }
    */

    // using the search model
    var search = new m.Search(query);


    var found = false;
    search.tracks.forEach(function(track) {
        if (found === true) return;
        found = parseTrack(track);
    });

    search.localResults = m.LOCALSEARCHRESULTS.APPEND;

    search.observe(m.EVENT.ITEMS_ADDED, function() {
        var found = false;
        search.tracks.forEach(function(track) {
            if (found === true) return;
            found = parseTrack(track);
        });
    });

    search.observe(m.EVENT.LOAD_ERROR, function() {
        console.log("ERROR");
    });

    search.appendNext();
}

// fetch track suggestions from echonest
function fetchSuggestions(artist, size) {

    // check if app is online
    if (!navigator.onLine) {
        setAutoPlay(false);
        // WTF? How am I meant to call back to the mother ship
        $('#results').html("<div class='error'>"+i18n.get('offline')+"</div>")
    }
    $('#results').html("<li class='loading'>"+i18n.get('loading')+"<span class='myThrobber'></span></li>")


    // find similar songs using echonest
    var url = 'http://developer.echonest.com/api/v4/playlist/basic?api_key='+echoNestAPIKey+'&callback=?';

    // in this demo i will only use artist-radio so that we don't need extra requests.
    $.getJSON(url, {
        artist: artist, 
        format: 'jsonp', 
        results: size,
        type: 'artist-radio'
    }, function(data) {

        // did we get a valid response?
        if (data.response && data.response.status.code === 0) {

            for (var i = 0; i < data.response.songs.length; i++) {
                
                // we now have the echo nest song
                var song = data.response.songs[i];
                
                // fetch spotify tracks from these songs using the search api
                fetchSpotifyTrack(song.artist_name, song.title);
            }
        }
        else { // NO WE DIDN'T ARGH ARGH ARGH
            // show an error
            var str = i18n.get("noSuggestions");
            str = str.replace(":artist",artist);
            $('#results').html("<div class='error'>"+str+"</div>");
        }
    });
}

// check the region of the track
function checkRegion(track) {
    return track.availableForPlayback;
}

// when the track changes, we need to listen for an event
sp.trackPlayer.addEventListener("playerStateChanged", function (event) {

    // just to check if we have changed the state ourselves
    if (paused) return;

    // check for onended, no onended event in spotify...
    checkLength();

    // if song has changed
    if (event.data.curtrack) {

        // change the song
        getCurrentlyPlaying();
    }
});

// play the next track
function playNext() {
    // are we meant to be playing the next one?
    if (!autoPlay) return;
    if ($("#results li:not(.loading).first").length === 0) {
        return setAutoPlay(false);
    }

    // pause it, this stops multiple issues happening
    paused = true;
    m.player.playing = false

    // click the first one
    $("#results li:not(.loading).first .sp-player-button").click();

    // no longer paused
    paused = false;

}

// this is due to no bastard onended event...
function checkLength() {

    // if no track, ignore
    if (!m.player.track) return;

    // this function may be called numerous times, but we only want one timer
    clearTimeout(checkTimer);

    // calculate the time left
    var timeLeft = m.player.track.duration - m.player.position

    // calculate if we are passed the point of skip to next track
    if (timeLeft < timerThreshold) {

        // if we are autoplaying
        if (autoPlay) {

            // play the next track mofo
            playNext();
        }
    } else {
        // set another time for some time in the future
        checkTimer = setTimeout("checkLength()",timeLeft/2);
    }
}

// set autoplay to what was previously set
setAutoPlay(window.localStorage['autoPlay']);

// check on start
getCurrentlyPlaying();
checkLength();

// bind click event to autoplay
$('#autoplay').click(function() {
    if ($(this).hasClass("noautoplay")) {
        setAutoPlay(true);
    } else {
        setAutoPlay(false);
    }
})

$("#shareButton").click(function() {
    application.showSharePopup($(this)[0],m.player.track.uri);     
});

function suggestFromURI(uri) {
    var track = m.Track.fromURI(uri);
    var artist = track.data.artists[0].name;
    console.log("fetching artist");
    // fetch suggestions
    fetchSuggestions(artist, 50);

    $('#currentlyPlaying').addClass("user-selected");    
    renderMainTrack(track);
    setAutoPlay(false);
    isTrackPlaying();
}

function noTrackPlaying() {

    // error that bad boy
    //$('#results').html("<div class='error'>"+i18n.get('noTrack')+"</div>");
    $('body').addClass("no-track");
}

function isTrackPlaying() {
    $('body').removeClass("no-track");    
}

// listen out for a sing being dropped on the icon
application.observe(m.EVENT.LINKSCHANGED, function (event) {
    var links =  sp.core.getLinks();
    console.log(links);
    if (links.length !== 1) return;
    var uri = links[0];
    if (uri.indexOf("track") > 0) {
        suggestFromURI(uri);   
    } else {
        
    }


    //["spotify:track:43mshkHAd4Nl8TQ1CBgraX"]
    //["spotify:artist:1GwxXgEc6oxCKQ5wykWXFs"]
    // if track

    // if artist
    console.log(links);
});

 // overwirte default click
$('a.sp-image').live('click', function(e) {
    e.preventDefault();
    window.location = $(this).parents('.cover').data("uri");

})

