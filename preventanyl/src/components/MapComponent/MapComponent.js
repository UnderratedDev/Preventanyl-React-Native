import React, { Component } from 'react';
import { AppRegistry, Text, View, TouchableOpacity, StyleSheet, Image } from 'react-native';

import MapView, { AnimatedRegion, Animated } from 'react-native-maps';
import Spinner from 'react-native-loading-spinner-overlay';

import Database from '../../database/Database'
import PreventanylNotifications from '../../pushnotifications/PreventanylNotifications';

import { convertLocationToLatitudeLongitude, getCurrentLocation, getCurrentLocationAsync, setupLocation } from '../../utils/location';
import { formatDateTime, compareDiffHoursNow, getMomentNow, getMomentNowSubtractHours } from '../../utils/localTimeHelper';
import { formatAddressObjectForMarker } from '../../utils/strings';
import { genericErrorAlert, notifyAngelErrorAlert } from '../../utils/genericAlerts';
import { generateAppleMapsUrl } from '../../utils/linkingUrls';

import Network from '../../utils/Network';
import GenericPopupDialog from '../../utils/GenericPopupDialog';
import MapCallout from '../../subcomponents/MapCallout/MapCallout';

import StaticKit from '../../objects/StaticKit';

import App from '../../../App';

const notifyTitle                  = "Notify Angels";
const HELP_COOL_DOWN               = 0.166667;
const HELP_COOL_DOWN_ERROR_MESSAGE = `Please wait ${ Math.round (HELP_COOL_DOWN * 60) } minutes before asking for help again`;

export default class MapComponent extends Component {

    watchId                        = undefined;
    static spinnerFunctionsLoading = 0;

    constructor () {
        super ();

        this.state = {
            region : null,
            staticKits : [],
            userLocation : {
                latlng : {
                    latitude  : null,
                    longitude : null,
                },
                error : null,
            },
            isLoading       : false,
            notifyMessage   : 'Notifying in 5 seconds',
            notifySeconds   : 5,
            notifyTimer     : null,
            notifyTimestamp : getMomentNowSubtractHours (2)
        }

        this.setInitialRegionState ();

        this.findMe = this.findMe.bind (this);
        this.helpMe = this.helpMe.bind (this);
        // PushNotifications.setup ();
    }

    watchLocation () {
        this.stopFollowingUserLocation ();
        this.watchId = navigator.geolocation.watchPosition (
            async (position) => {
                // console.log (position)

                this.setState (
                    {
                        userLocation : {
                            latlng : {
                                latitude  : position.coords.latitude,
                                longitude : position.coords.longitude,
                            },
                            error     : null,
                        }
                    }
                );

            },
            (error) => this.setState ( 
                {
                    error : error.message
                }
            ),
            { 
                enableHighAccuracy : true,
                timeout : 20000,
                maximumAge : 1000,
                distanceFilter : 10
            }
        );
    }

    stopFollowingUserLocation () {
        navigator.geolocation.clearWatch (this.watchId);
    }

    async componentDidMount () {
        this.mounted = true;

        this.setState (
            {
                isLoading : true
            }
        );

        Network.setupNetworkConnection ();

        this.watchLocation ();

        // Could clear by adding to pauseFunctions however it is being cleared in componentWillUnmount
        App.addResumeFunction ( () => 
            {

                setupLocation ( (result) => {

                    this.convertLocationMount (result, (location) => 
                        {
                            console.log ('location ,', location);
                        }
                    )
                    
                    this.watchLocation ();
                }, (error) => 
                    {
                        console.log (error);
                    }
                )

            }
        );

        App.addResumeFunction ( () => 
            {

                Network.checkNetworkConnection ( (connectionInfo) => 
                    {
                        Network.changeNetworkStatus ();
                    },
                    (connectionInfo) => {
                        Network.changeNetworkStatus ();
                    },
                    (error) => {
                        Network.setConnectionObject (false, Network.ConnectionTypes.NONE);
                        notifyAngelErrorAlert ();
                    }
                )

            }
        )


        // For Future, do this on load, and afterwards check for change for efficency
        Database.listenForItems (Database.firebaseRefs.staticKitsRef, async (kits) => {

            await this.simpleLoadingFunction ( async () => {
                let staticKits = [];

                staticKits = kits.map ( (kit) => 
                    {
                        return StaticKit.generateOverdoseFromSnapshot (kit);
                    }
                )
                    
                this.setState (
                    {
                        staticKits : staticKits
                    }
                );
                
            })

        });

    }

    async componentWillUnmount () {
        this.stopFollowingUserLocation ();
        this.mounted = false;
    }

    // PRECONDITION : isLoading must be true before function call
    simpleLoadingFunction = async (func) => {

        try {

            ++MapComponent.spinnerFunctionsLoading;
            await func ();

        } catch (error) {

            console.warn (error);
            genericErrorDescriptionAlert (error);

        } finally {

            --MapComponent.spinnerFunctionsLoading;

            if (MapComponent.spinnerFunctionsLoading === 0 && this.mounted)
                this.setState (
                    {
                        isLoading : false
                    }
                )

        }

    }

    genericCreateRegion (location) {
        return {
            latitude       : location.latitude,
            longitude      : location.longitude,
            latitudeDelta  : 0.005,
            longitudeDelta : 0.005
        }
    }

    genericCreateRegionDelta (location, latitudeDelta, longitudeDelta) {
        return {
            latitude       : location.latitude,
            longitude      : location.longitude,
            latitudeDelta  : latitudeDelta,
            longitudeDelta : longitudeDelta
        }
    }

    convertLocationMount (result, successCallback) {
        let location = convertLocationToLatitudeLongitude (result);

        if (this.mounted)
            this.setState (
                {
                    userLocation : location
                }
            );

        location = this.genericCreateRegion (location.latlng);

        successCallback (location);
    }

    createRegionCurrentLocation (successCallback, failureCallback) {

        getCurrentLocation ((result) => {
            this.convertLocationMount (result, (location) => {
                successCallback (location);
            })

        }, (error) => {
            failureCallback (new Error("Unable to create region"));
        })

    }

    setupRegionCurrentLocation (successCallback, failureCallback) {
        setupLocation ((result) => {
            let location = convertLocationToLatitudeLongitude (result);

            if (this.mounted)
                this.state.userLocation = location;

            location = this.genericCreateRegion (location.latlng);

            successCallback (location);
        }, (error) => {
            failureCallback (new Error("Unable to create region"));
        })
    }

    setInitialRegionState() {

        this.setupRegionCurrentLocation ( (result) => {
            this.setState (
                {
                    region : result
                }
            );
        }, (error) => 
            {
                this.setState (
                    {
                        region : {
                            latitude: 49.246292,
                            longitude: -123.116226,
                            latitudeDelta: 0.2,
                            longitudeDelta: 0.2,
                        }
                    }
                );
            }
        );

    }

    resetHelpTimer () {

        if (this.state.notifyTimer != null)
            clearInterval (this.state.notifyTimer);

        this.setState (
            {
                notifySeconds : 5,
                notifyMessage : `Notifying in ${ this.state.notifySeconds } seconds`
            }
        )
       
    }

    helpMe () {

        this.resetHelpTimer ();

        if (!Network.connectionObject.connected) {
            notifyAngelErrorAlert ();
            return;
        }

        console.log (compareDiffHoursNow (this.state.notifyTimestamp));

        if (compareDiffHoursNow (this.state.notifyTimestamp) < HELP_COOL_DOWN) {
            genericErrorAlert (HELP_COOL_DOWN_ERROR_MESSAGE);
            return;
        }

        this.popupDialog.show();

        let notifyTimer = setInterval (() => {
            if (this.state.notifySeconds > 0)
                this.setState (
                    {
                        notifySeconds : this.state.notifySeconds - 1,
                        notifyMessage : `Notifying in ${ this.state.notifySeconds } seconds`
                    }
                )
            else {
                console.log ("TIME IS ZERO");
                this.notfiyAngelsWithUpdates ();
            }
        }, 1000);

        this.setState (
            {
                notifyTimer     : notifyTimer,
            }
        )
        
    }

    findMe () {

        this.createRegionCurrentLocation ((region) => {
            this.setState (
                {
                    region : region
                }
            )

            // Center on user position
            this.map.animateToRegion (this.state.region);
        }, (error) => 
            {
                genericErrorAlert ("Failed to find user");
            }
        );

    }

    notfiyAngelsWithUpdates () {
        console.log ("Notifying Angels");
        this.resetHelpTimer ();
        PreventanylNotifications.notifyAngels ( () => 
            {

                this.setState (
                    {
                        notifyTimestamp : getMomentNow ()
                    }
                )        
            }, (error) => 
            {
                console.log (error);
            }
        );

        this.popupDialog.dismiss ();
    }

    render () {
        return (
            <View style = { styles.container }>

                <Spinner
                    visible = { this.state.isLoading }
                    textContent = { "Loading..." }
                    textStyle = {
                        { color : '#FFF' }
                    }
                    cancelable = { false } />

                {/* <PopupDialog
                    ref = { (popupDialog) => { this.popupDialog = popupDialog; }} >
                    <View>
                        <Text>{ this.state.notifyTitle }</Text>
                    </View>
                </PopupDialog> */}
                
                <GenericPopupDialog 
                    title = { notifyTitle } 
                    message = { this.state.notifyMessage } 
                    ref = { (popupDialog) => { this.popupDialog = popupDialog; } } 
                    actionButtonText = "Notify Angels"
                    cancelFunction = { () => 
                        {
                            console.log ("Cancelling Popup")
                            this.resetHelpTimer ();
                        }
                    }
                    actionFunction = { () => 
                        { 
                            console.log ("Notifying Angels");
                            this.notfiyAngelsWithUpdates ();
                        }
                    } />

                <MapView 
                    style = { styles.map }
                    initialRegion = { this.state.region }
                    ref   = { map => { 
                        this.map = map 
                        }
                    } >

                    <TouchableOpacity
                        styles = { styles.findMeBtn }
                        onPress = { this.findMe } 
                        underlayColor = '#fff'>

                        <Image 
                            source = {
                                require('../../../assets/location.imageset/define_location.png')
                            } />

                    </TouchableOpacity>

                    { this.state.userLocation.latlng.latitude != null && this.state.userLocation.latlng.longitude != null &&
                        <MapView.Marker 
                            coordinate  = { this.state.userLocation.latlng } 
                            title       = "Current position"
                            description = "You are here"
                            image       = { require('../../../assets/location-pin.imageset/location-pin-1.png') } />
                    }

                    {
                        this.state.staticKits.length > 0 &&
                        this.state.staticKits.map ((marker, index) => (
                            <MapView.Marker
                                key         = { index }
                                coordinate  = { marker.latlng }
                                title       = { marker.title }
                                description = { marker.formattedDescription }
                                image       = { require('../../../assets/needle.imageset/needle-red.png') } >

                                <MapCallout 
                                    title = { marker.title }
                                    description = { marker.formattedDescription }
                                    url = { generateAppleMapsUrl ( this.state.userLocation.latlng, marker.latlng ) } />
                                
                            </MapView.Marker>
                        ))
                    }

                </MapView>

                <TouchableOpacity
                    style = { styles.helpMeBtn }
                    onPress = { this.helpMe.bind (this) }
                    underlayColor = '#fff'>
                    <Text style = { styles.helpMeText }>Help Me</Text>
                </TouchableOpacity>
                
            </View>
        );
    }
}


const styles = StyleSheet.create ({
    container : {
        flex : 1,
        backgroundColor : '#F5FCFF',
        flexDirection : 'column',
    },
    map : {
        flex : 12,
    },
    helpMeBtn : {
        flex : 1,
        backgroundColor : '#8b0000',
    },
    helpMeText : {
        color:'#fff',
        textAlign:'center',
        fontWeight: 'bold',
        paddingLeft : 10,
        paddingRight : 10,
        paddingTop : 10,
        paddingBottom : 10
    }
})

AppRegistry.registerComponent ('MapComponent', () => MapComponent);