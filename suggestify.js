var tracksPlayed = {};

    var autoPlay = false;

    function checkRecentPlays(track) {
        if (tracksPlayed[track.uri])
            return true;
        return false;
    }

    function setAutoPlay(value) {
        if (value) { // is autoplaying
            tracker.track("app/autoplay/on");
            $('#autoplay').removeClass("noautoplay").addClass("autoplay").html("Autoplay on");
            $('#results li').first().addClass("first");

        } else {
            tracker.track("app/autoplay/off");
            $('#autoplay').removeClass("autoplay").addClass("noautoplay").html("Autoplay off");
            $('#results li.first').removeClass("first");
        }
        autoPlay = value;
    }

    $('#autoplay').click(function() {
        if ($(this).hasClass("noautoplay")) {
            setAutoPlay(true);
        } else {
            setAutoPlay(false);
        }
    })



    // get the standard spotify api
    var sp = getSpotifyApi(1);

    // get the spotify models
    var m = sp.require('sp://import/scripts/api/models');
    var v = sp.require('sp://import/scripts/api/views');

    var searching = false,
        displayCount = 0;

    function refresh() {
        getCurrentlyPlaying();
        refreshCount++;
    }


    // get the track that is currently playing
    function getCurrentlyPlaying() {

        searching = true;
        displayCount = 0;
        refreshCount = 0;

        var currentTrack = m.player.track;
        
        // if nothing currently playing
        if (currentTrack == null) {
            $('#results').html("<div class='error'><h2>Sorry! I can't suggest any songs as there is no current track</h2><p>When I can recommend some more songs, I'll let you know here!</p></div>")
            console.log("No track currently playing");
        }

        // winner we have a track
        else {
            $('#results > *').fadeOut();

            var track = currentTrack.data;
            var artist = track.artists[0].name;

            tracksPlayed[track.uri] = track;

            // fetch Suggestions
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

    /*
        var t = v.Track(track);
        console.log(t);
        return;
      */  

        // check track isn't already playing
        if (m.player.track && m.player.track.data.uri === track.uri) {
            return;
        }
        if (!searching)
            return;

        displayCount++

        if (displayCount >= 11)
            return;

        $('#results > *').fadeIn();

        // create a list element
        var li = $("<li/>");

        if (displayCount === 1) {
            if (autoPlay) {
                li.addClass("first");
            }
            li.append("<span class='first'>Next Track</span>");
        }

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

        var $artist = img.find(".artist");
        for (var i = 0; i<track.artists.length;i++) {
            if (i > 0)
                $artist.append(", ");
            $artist.append("<a href='"+track.artists[0].uri+"'>"+track.artists[0].name+"</a>")

        }

        li.append(img);

        // add the list item
        $("#results").append(li);
    }

    // using artist name and song name, find the spotify track
    function fetchSpotifyTrack(artist,song) {

        var query = artist + " " + song;

     

        function parseTrack(track) {
            // may be an album
            if (track.type === "track") {

                // check that the artist name is the same
                if (track.artists && track.artists[0].name === artist) {
                    
                    // check that the track name is the same
                    if (track.name === song) {

                        // don't forget not all songs are available everywhere
                        if (checkRegion(track) && !checkRecentPlays(track)) {

                            window.localStorage[query] = track.uri;
                            renderTrack(track);

                            // we no longer what to loop
                            return true
                        }
                    }
                }
            }
        }

        if (window.localStorage[query]) {
            console.log(query);
            var track = m.Track.fromURI(window.localStorage[query]);
            parseTrack(track.data);
            return;
        }
        console.log("no"+query);

        // using the search model
        var search = new m.Search(query,function(results) {

            if (!searching) return;
            console.log('search');
            // spotify may return more than one possible track
            for (var i= 0; i< results.results.length;i++) {
                var track = results.results[i].data;

                if (parseTrack(track) === true)
                    break;
            }
        });
    }

    // fetch track suggestions from echonest
    function fetchSuggestions(artist, size) {
        var echoNestAPIKey = "GPQCPTGUIZ43M2FSV";
        // find similar songs using echonest
        var url = 'http://developer.echonest.com/api/v4/playlist/basic?api_key='+echoNestAPIKey+'&callback=?';

        // in this demo i will only use artist-radio so that we don't need extra requests.
        $.getJSON(url, {
            artist: artist, 
            format: 'jsonp', 
            results: size,
            type: 'artist-radio'
        }, function(data) {
            if (data.response && data.response.status.code === 0) {
                $("#results").empty();

                for (var i = 0; i < data.response.songs.length; i++) {
                    
                    // we now have the echo nest song
                    var song = data.response.songs[i];
                    
                    // fetch spotify tracks from these songs using the search api
                    fetchSpotifyTrack(song.artist_name, song.title);
                }
            } else {
                $('#results').html("<div class='error'><h2>Sorry! I can't suggest any songs for the artist: "+artist+".</h2><p>To be honest, I have never heard of them before. I hope they are pretty good :)</p><p>When I can recommend some more songs, I'll let you know here!</p></div>");
            }
        });
    }


    // check the region of the track
    function checkRegion(track) {
        return track.availableForPlayback;
    }

    checkTimer = undefined;
    paused = false;

    // when the track changes, we need to listen for an event
    sp.trackPlayer.addEventListener("playerStateChanged", function (event) {
        if (paused) return;

        checkLength();
        // if song has changed
        if (event.data.curtrack) {
            // change the song
            getCurrentlyPlaying();
        }
    });

    function playNext() {
        paused = true;
        m.player.playing = false
        $("#results li.first a").click();
        paused = false;

    }

    timerThreshold = 2000;

    function checkLength() {
        if (!m.player.track)
            return;
        clearTimeout(checkTimer);
        var timeLeft = m.player.track.duration - m.player.position;
        if (timeLeft < timerThreshold) {
            if (autoPlay) {
                playNext();
            }
            return;
        }

        checkTimer = setTimeout("checkLength()",timeLeft/2);

    }



    // check on start
    getCurrentlyPlaying();
    checkLength();

var googletracker = sp.require("sp://import/scripts/googletracker")
var tracker = new googletracker.GoogleTracker("UA-19804545-13");
tracker.track("app");

