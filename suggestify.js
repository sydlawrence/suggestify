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

// get the standard spotify apis
var sp = getSpotifyApi(1);
var m = sp.require('sp://import/scripts/api/models');
var v = sp.require('sp://import/scripts/api/views');

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
    
    // setup the tweet button
    var tweetText = "I just discovered {TRACK}".replace('{TRACK}',track.name + " by " + track.artists[0].name);
    var tweetLink = track.uri.replace('spotify:track:','http://open.spotify.com/track/');
    
    
    tweetUrl = "https://twitter.com/share?url="+tweetLink+"&via=spotify&text="+tweetText+"&hashtags=suggestify";
    
    
    twitterUrl = "http://platform.twitter.com/widgets/tweet_button.html?count=none&size=large&url="+tweetLink+"&via=spotify&text="+tweetText+"&hashtags=suggestify";
    $('#twitter_share_frame').attr('src',twitterUrl).css('border-radius','5px');
    
    
      
    // setup the display block
    playing.show();
    playing.find("a.track").attr('href',track.uri);

    playing.find(".image").css('background','url('+track.album.cover+')');
    playing.find(".title").html(track.name);
    playing.find("#popularity").html(track.popularity);

    /*
    var $star = $("<span class='star'></span>");

    playing.find('#starred').html($star);

    if (track.starred === true) {
        $star.addClass("yes");
        $star.html("yes").click(function() {
            track.starred = false;
            renderMainTrack(track);

        });
    } else {
        $star.addClass("no");
        $star.html("no").click(function() {
            track.starred = true;
            renderMainTrack(track);
        });
    }
    */

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
    
    renderMainTrack(currentTrack.data);

    // if nothing currently playing
    if (currentTrack == null) {

        // error that bad boy
        $('#results').html("<div class='error'><h2>Sorry! I can't suggest any songs as there is no current track</h2><p>When I can recommend some more songs, I'll let you know here!</p></div>")
    }

    // winner we have a track
    else {

        // fade it
        $('#results > *').fadeOut();

        // get the trackand the artist
        var track = currentTrack.data;
        var artist = track.artists[0].name;

        // add to history
        tracksPlayed[track.uri] = track;

        // fetch suggestions
        fetchSuggestions(artist, 30);
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
    if (m.player.track && m.player.track.data.uri === track.uri) {
        return;
    }
    if (!searching)
        return;

    // fade them all in
    $('#results > *').fadeIn();

    // create a list element
    var li = $("<li/>");

    // if first list item and autoplay
    if (displayCount === 0 && autoPlay)
        li.addClass("first");

    // the markup
    var img =  $("<div class='cover'>"+
                    "<a href='"+track.uri+"'>"+
                        "<span class='image' style='height:150px;width:150px;background:url("+track.album.cover+")'></span>"+
                        "<span class='player'></span>"+
                    "</a>"+
                        "<span class='title'>"+track.name+"</span>"+
                        "<span class='artist'></span>"+
                "</div>");
   

    // play it on click
    img.find("a").click(function() {
        playTrack(track);
        return false;
    });

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
                        renderTrack(track);

                        // we no longer what to loop
                        return true
                    }
                }
            }
        }
    }

    // have we have found info on this before?
    if (window.localStorage[query]) {

        // damn straight we have, well we no longer need to search spotify for it
        var track = m.Track.fromURI(window.localStorage[query]);
        parseTrack(track.data);
        return;
    }

    // using the search model
    var search = new m.Search(query,function(results) {

        // check that it isn't already searching... I think this was put in as a precautionary measure... probably should have commented before ;)
        if (!searching) return;

        // spotify may return more than one possible track
        for (var i= 0; i< results.results.length;i++) {

            // get the actual track
            var track = results.results[i].data;

            // parse it, if it is what we want, then no need to loop through tracks
            if (parseTrack(track) === true)
                break;
        }
    });
}

// fetch track suggestions from echonest
function fetchSuggestions(artist, size) {

    // check if app is online
    if (!navigator.onLine) {
        setAutoPlay(false);
        // WTF? How am I meant to call back to the mother ship
        $('#results').html("<div class='error'><h2>Sorry! I can't call the mother ship as you appear to be offline.</h2><p>When you go back online, I can recommend some more songs.</p></div>")
    }

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

            // empty the results div
            $("#results").empty();

            for (var i = 0; i < data.response.songs.length; i++) {
                
                // we now have the echo nest song
                var song = data.response.songs[i];
                
                // fetch spotify tracks from these songs using the search api
                fetchSpotifyTrack(song.artist_name, song.title);
            }
        }
        else { // NO WE DIDN'T ARGH ARGH ARGH
            // show an error
            $('#results').html("<div class='error'><h2>Sorry! I can't suggest any songs for the artist: "+artist+".</h2><p>To be honest, I have never heard of them before. I hope they are pretty good :)</p><p>When I can recommend some more songs, I'll let you know here!</p></div>");
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

    // pause it, this stops multiple issues happening
    paused = true;
    m.player.playing = false

    // click the first one
    $("#results li.first a").click();

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



