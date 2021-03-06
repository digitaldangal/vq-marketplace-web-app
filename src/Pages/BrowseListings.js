import React, { Component } from 'react';
import FileCloud from 'material-ui/svg-icons/file/cloud';
import MapsPlace from 'material-ui/svg-icons/maps/place';
import InputRange from 'react-input-range';
import Loader from "../Components/Loader";
import TaskCard from '../Components/TaskCard';
import TaskListItem from '../Components/TaskListItem';
import VIEW_TYPES from '../constants/VIEW_TYPES';
import FILTER_DEFAULTS from '../constants/FILTER_DEFAULTS';
import TASK_CATEGORY_STATUS from '../constants/TASK_CATEGORY_STATUS';
import { displayPrice, displayUnit }  from '../core/format';
import apiTask from '../api/task';
import * as apiCategory from '../api/category';
import TaskMap from "../Components/TaskMap";
import Autocomplete from 'react-google-autocomplete';
import OfferViewTypeChoice from "../Components/OfferViewTypeChoice";
import { formatGeoResults } from '../core/util';
import { luminateColor } from '../core/format';
import { goTo, setQueryParams } from '../core/navigation';
import { getUserAsync } from '../core/auth';
import { CONFIG } from '../core/config';
import { translate } from '../core/i18n';
import { getMeOutFromHereIfAmNotAuthorized } from '../helpers/user-checks';
import { getMode } from '../core/user-mode.js';

const _chunk = require('lodash.chunk');

let updatingResults;

class Offers extends Component {
    constructor(props) {
        super(props);

        const query = this.props.location.query;

        let locationQueryString;

        if ((query.q && query.q !== 'null') || (query.lat && query.lng && query.rad)) {
            locationQueryString = (query.q || `${query.lat} ${query.lng} ${query.rad}`);
        }
        
        const appliedFilter = this.setFilterDefaults(query);

        this.state = {
            offers: [],
            offerMarkers: [],
            queryCity: null,
            autoCompleteText: '',
            isLoading: true,
            userType: undefined,
            locationQueryString,
            appliedFilter,
            offer: {
                utm: {}
            }
        };        
    }

    componentWillMount() {
        apiCategory
        .getItems()
        .then(categories => {
           this.setState({
               categories
           });
           this.updateResults(this.state.appliedFilter);
        });
    }

    componentDidMount() {
        getUserAsync(user => {
            if (CONFIG.LISTING_ENABLE_PUBLIC_VIEW !== "1"){
                return getMeOutFromHereIfAmNotAuthorized(user);
            }

            const appliedFilter = this.state.appliedFilter;

            const userType = user ? user.userType : undefined;
            appliedFilter.listingType = this.getListingTypeFromUserType(userType);
            
            this.setState({
                userType,
                appliedFilter
            })
            this.updateResults(appliedFilter);
            
        }, true);
    }

    displayIconElement (offer) {
        if (offer && offer.location && offer.location.formattedAddress){
            return <MapsPlace viewBox='-20 -7 50 10' />;
        }

        return <FileCloud viewBox='-20 -7 50 10'/>;
    }

    getListingTypeFromUserType(userType) {
        if (!userType && CONFIG.LISTING_ENABLE_PUBLIC_VIEW === "1") {
            return Number(CONFIG.LISTING_PUBLIC_VIEW_MODE);
        } else if (!userType && CONFIG.LISTING_ENABLE_PUBLIC_VIEW !== "1") {
            if (CONFIG.USER_TYPE_SUPPLY_LISTING_ENABLED === "1" && CONFIG.USER_TYPE_DEMAND_LISTING_ENABLED !== "1") {
                return 2;
            }
            if (CONFIG.USER_TYPE_SUPPLY_LISTING_ENABLED !== "1" && CONFIG.USER_TYPE_DEMAND_LISTING_ENABLED === "1") {
                return 1;
            }
            if (CONFIG.USER_TYPE_SUPPLY_LISTING_ENABLED === "1" && CONFIG.USER_TYPE_DEMAND_LISTING_ENABLED === "1") {
                return 2;
            }
        } else if (userType) {
            switch(userType) {
                case 0: {
                    return Number(getMode()) === 1 ? 2 : 1;
                }
                case 1: {
                    return CONFIG.USER_TYPE_SUPPLY_LISTING_ENABLED === "1" ? 2 : 1;
                }
                case 2: {
                    return CONFIG.USER_TYPE_DEMAND_LISTING_ENABLED === "1" ? 1 : 2;
                }
                default: {
                    return 1
                }
            }
        }
    }

    getConfigValue(configKey) {
      if (typeof CONFIG[configKey] === 'undefined' && typeof FILTER_DEFAULTS[configKey] !== 'undefined') {
        return FILTER_DEFAULTS[configKey];
      }
      return CONFIG[configKey];
    }

    loadTasks(query) {
        this.setState({
            isLoading: true
        }); 

        apiTask
        .getItems({
            untilNow: CONFIG.LISTING_TIMING_MODE === '1' ? 1 : undefined,
            minPrice: query.minPrice,
            maxPrice: query.maxPrice,
            taskType: query.listingType,
            status: '0',
            lat: query.lat,
            lng: query.lng,
            rad: query.rad,
            category: query.category
        })
        .then(offers => {
            offers = offers
            .filter(offer => {
                if (offer.priceType === null) {
                    console.error(`Task ${offer.id} has priceType of type null`);

                    return false;
                }

                return true;
            })

            const offerMarkers = offers
                .filter(_ => _.location)
                .map(_ => {
                    _.position = {
                        lat: _.location.lat,
                        lng: _.location.lng
                    };

                    return _;
                });


            this.setState({
                isLoading: false,
                offerMarkers,
                offers,
                offersChunksMD: _chunk(offers, 3),
                offersChunksXS: _chunk(offers, 2)
            });
        });
    }

    searchUpdated (term) {
        this.setState({
            searchTerm: term
        });
    }

    updateResults (query) {
        const appliedFilter = {
            ...this.state.appliedFilter,
            ...query
        };
        setQueryParams(appliedFilter);

        this.setState({
            appliedFilter
        });

        this.loadTasks(appliedFilter);
    }

    setFilterDefaults(query) {
        const appliedFilter = {};
        appliedFilter.lat = query.lat ? query.lat : undefined;
        appliedFilter.lng = query.lng ? query.lng : undefined;
        if (CONFIG.LISTING_RANGE_FILTER_ENABLED === "1" && appliedFilter.lat && appliedFilter.lng) {
            appliedFilter.rad = query.rad ? query.rad : CONFIG.LISTING_RANGE_FILTER_DEFAULT_VALUE;
        }

        appliedFilter.category = query.category ? query.category : undefined;

        if (CONFIG.LISTING_PRICE_FILTER_ENABLED === "1") {
            appliedFilter.minPrice = query.minPrice ? query.minPrice : CONFIG.LISTING_PRICE_FILTER_MIN;
            appliedFilter.maxPrice = query.maxPrice ? query.maxPrice : CONFIG.LISTING_PRICE_FILTER_MAX;
        }

        appliedFilter.viewType = query.viewType ? Number(query.viewType) : Number(CONFIG.LISTINGS_DEFAULT_VIEW);
        appliedFilter.listingType = query.listingType ? query.listingType : this.getListingTypeFromUserType(undefined);
        
        return appliedFilter;
    }

    render() {
        const SidebarContent =
        <div className="row hidden-xs">
            { CONFIG.USER_ENABLE_SUPPLY_DEMAND_ACCOUNTS === "1" &&
                <div className="col-xs-12">
                    <span style={{
                        fontWeight: this.state.appliedFilter.listingType === 1 ?
                            'bold' :
                            'normal'
                    }}
                    className="vq-uppercase with-pointer" onClick={
                        () => this.updateResults({ listingType: 1 })
                    }>
                        { translate('DEMAND_LISTING_FILTER') }
                    </span>
                </div>
            }

            { CONFIG.USER_ENABLE_SUPPLY_DEMAND_ACCOUNTS === "1" &&
                <div className="col-xs-12">
                    <span style={{
                        fontWeight: this.state.appliedFilter.listingType === 2 ?
                        'bold' :
                        'normal'
                    }}
                    className="vq-uppercase with-pointer" onClick={
                        () => this.updateResults({ listingType: 2 })
                    }>
                        { translate('SUPPLY_LISTING_FILTER') }
                    </span>
                </div>
            }

            <div className="col-xs-12" style={{ marginTop: 25 }}>
                <div>
                    <span style={{
                        fontWeight: !this.state.appliedFilter.category ? 'bold' : 'normal'
                    }}
                    className="vq-uppercase with-pointer" onClick={
                        () => this.updateResults({
                            listingType: this.state.appliedFilter.listingType,
                            category: undefined
                        })
                    }>
                        { translate('ALL_CATEGORIES') }
                    </span>
                </div>
            {
            this.state.categories &&
            this.state.categories
            .filter(category => category.status === TASK_CATEGORY_STATUS.ACTIVE)
            .map((category, index) =>
                <div key={index}>
                    <span style={{
                        fontWeight: this.state.appliedFilter.category === category.code ? 'bold' : 'normal',
                        marginLeft: '15px'
                    }} className="with-pointer" onClick={
                    () => {
                        this.updateResults({
                            listingType: this.state.appliedFilter.listingType,
                            category: category.code
                        });
                    }
                    }>{translate(category.code) === category.code ?
                        category.label : translate(category.code)
                    }
                    </span>
                </div>
            )
            }
            </div>
            { CONFIG.LISTING_PRICING_MODE === "1" && CONFIG.LISTING_PRICE_FILTER_ENABLED === "1" &&
            <div
                className="col-xs-12"
                style={{
                    marginTop: 50
                }}
            >
                <span className="vq-uppercase vq-bold">
                    <strong>{translate('PRICE')}</strong>
                </span>
                <hr style={{
                    marginTop: '5px'
                }}/>
                <div style={{ width: '100%' }}>
                    <h4 style={{ fontSize: '14px' }}>{this.state.appliedFilter.minPrice}-{this.state.appliedFilter.maxPrice} {displayPrice(undefined, this.getConfigValue('PRICING_DEFAULT_CURRENCY'), 1)}</h4>
                        <InputRange
                            formatLabel={value => displayPrice(value, this.getConfigValue('PRICING_DEFAULT_CURRENCY'), 1)}
                            maxValue={Number(CONFIG.LISTING_PRICE_FILTER_MAX)}
                            minValue={Number(CONFIG.LISTING_PRICE_FILTER_MIN)}
                            step={Number(CONFIG.LISTING_PRICE_FILTER_STEP)}
                            value={{
                                min: Number(this.state.appliedFilter.minPrice),
                                max: Number(this.state.appliedFilter.maxPrice)
                            }}
                            onChange={value => {
                                const appliedFilter = this.state.appliedFilter;

                                appliedFilter.minPrice = value.min;
                                appliedFilter.maxPrice = value.max;

                                if (!updatingResults) {
                                    updatingResults = setTimeout(() => {
                                        updatingResults = null;

                                        this.updateResults(appliedFilter);
                                    }, 1000);
                                }

                                return this.setState({
                                    appliedFilter
                                });
                            }}
                        />
                </div>
            </div>
            }
            { CONFIG.LISTING_RANGE_FILTER_ENABLED === "1" &&
            this.state.appliedFilter.rad &&
            <div
                className="col-xs-12"
                style={{
                    marginTop: 50
                }}
            >
                <span className="vq-uppercase vq-bold">
                    <strong>{translate('RANGE')}</strong>
                </span>
                <hr style={{
                    marginTop: '5px'
                }}/>
                <div style={{ width: '100%' }}>
                    <h4 style={{ fontSize: '14px' }}>{this.getConfigValue('LISTING_RANGE_FILTER_MIN')}-{this.state.appliedFilter.rad} {displayUnit(undefined, 'meters')}</h4>
                        <InputRange
                            formatLabel={value => displayUnit(value, 'meters')}
                            maxValue={Number(CONFIG.LISTING_RANGE_FILTER_MAX)}
                            minValue={Number(CONFIG.LISTING_RANGE_FILTER_MIN)}
                            step={Number(CONFIG.LISTING_RANGE_FILTER_STEP)}
                            value={Number(this.state.appliedFilter.rad)}
                            onChange={value => {
                                const appliedFilter = this.state.appliedFilter;

                                appliedFilter.rad = value;

                                if (!updatingResults) {
                                    updatingResults = setTimeout(() => {
                                        updatingResults = null;

                                        this.updateResults(appliedFilter);
                                    }, 1000);
                                }

                                return this.setState({
                                    appliedFilter
                                });
                            }}
                        />
                </div>
            </div>
            }
        </div>;

        return (
            <div>
                <style dangerouslySetInnerHTML={
                    //this is to change colors of the range slider
                    {__html: `
                        .input-range__track--active {
                            background: ${CONFIG.COLOR_PRIMARY} !important;
                        }
                        .input-range__slider {
                            background: ${luminateColor(CONFIG.COLOR_PRIMARY, -0.2)} !important;
                            border-color: ${luminateColor(CONFIG.COLOR_PRIMARY, -0.2)} !important;
                        }
                    `}
                }>
            </style>
                <div className="vq-listings-intro text-center" style={{
                    background: `url(${CONFIG.PROMO_URL_MARKETPLACE_BROWSE || CONFIG.PROMO_URL_SELLERS || CONFIG.PROMO_URL}) ${CONFIG.PROMO_URL_MARKETPLACE_BROWSE ? "" : "no-repeat center center fixed"}`,
                    backgroundSize: 'cover'
                }}>
                    <div
                        className="col-xs-12 col-sm-8 col-sm-offset-2 col-md-6 col-md-offset-3"
                        style={{ marginTop: 25 }}
                    >
                        <div style={{
                            maxWidth: '850px',
                            margin: '0 auto'
                        }}>
                            { CONFIG.LISTING_GEOFILTER_ENABLED !== "1" &&
                                <h1 style={{
                                    color: "white",
                                    fontSize: 25
                                }}>
                                    {translate('START_PAGE_HEADER')}
                                </h1>
                            }
                            { CONFIG.LISTING_GEOFILTER_ENABLED !== "1" &&
                                <h2 style={{
                                    color: "white",
                                    fontSize: 18
                                }}>
                                    {translate('START_PAGE_DESC')}
                                </h2>
                            }

                            { CONFIG.LISTING_GEOFILTER_ENABLED === "1" &&
                            <div style={{ marginTop: 30 }}>
                                <Autocomplete
                                    value={this.state.locationQueryString}
                                    onChange={ev => {
                                        const locationQueryString = ev.target.value;
                                        const newState = {};

                                        if (locationQueryString === '') {
                                            const appliedFilter = this.state.appliedFilter;

                                            appliedFilter.lat = null;
                                            appliedFilter.lng = null;
                                            appliedFilter.rad = null;
                                            appliedFilter.q = null;

                                            newState.appliedFilter = appliedFilter;

                                            this.updateResults(appliedFilter);
                                        }

                                        newState.locationQueryString = locationQueryString;

                                        this.setState(newState);
                                    }}
                                    style={{
                                        padding: 5,
                                        fontSize: 20,
                                        border: 0,
                                        borderRadius: 5,
                                        width: '100%',
                                        height: 50
                                    }}
                                    componentRestrictions={{
                                        country: CONFIG.LISTING_GEOFILTER_COUNTRY_RESTRICTION
                                    }}
                                    onPlaceSelected={place => {
                                        const locationQueryString = place.formatted_address;
                                        const locationValue = formatGeoResults([
                                            place
                                        ])[0];
                                        const appliedFilter = this.state.appliedFilter;

                                        appliedFilter.lat = locationValue.lat;
                                        appliedFilter.lng = locationValue.lng;
                                        appliedFilter.rad = locationValue.rad;
                                        appliedFilter.q = locationQueryString;

                                        this.setState({
                                            locationQueryString,
                                            appliedFilter
                                        });

                                        this.updateResults({
                                            q: locationQueryString,
                                            lat: appliedFilter.lat,
                                            lng: appliedFilter.lng,
                                            rad: appliedFilter.rad
                                        });
                                    }}
                                    types={[
                                        CONFIG.LISTING_GEOFILTER_MODE ?
                                        `(${CONFIG.LISTING_GEOFILTER_MODE})` :
                                        '(cities)'
                                    ]}
                                    placeholder={translate('LISTING_FILTER_GEO')}
                                >
                                </Autocomplete>
                                { this.state.locationQueryString &&
                                    <button
                                        onTouchTap={() => {
                                            const appliedFilter = this.state.appliedFilter;
                                            const locationQueryString = '';

                                            delete appliedFilter.lat;
                                            delete appliedFilter.lng;
                                            delete appliedFilter.rad;
                                            delete appliedFilter.q;

                                            this.setState({
                                                locationQueryString,
                                                appliedFilter
                                            });

                                            this.updateResults(appliedFilter);
                                        }}
                                        className="close-icon"
                                        type="reset"
                                    ></button>
                                }
                            </div>
                            }
                        </div>
                    </div>
                </div>

                <div className="container custom-xs-style" style={{ marginTop: '10px' }}>
                    <div className="col-sm-4 col-md-3 col-lg-2">
                        <div className="row">
                            {SidebarContent}
                        </div>
                    </div>
                    <div className="col-lg-2 visible-lg">
                    </div>
                    <div className="col-sm-8 col-md-9 col-lg-8 custom-xs-style" >
                        <div className="col-xs-12" style={{ marginBottom: '20px' }}>
                            {Boolean(this.state.appliedFilter.viewType) &&
                                <OfferViewTypeChoice
                                    className="pull-right"
                                    selected={this.state.appliedFilter.viewType}
                                    onSelect={viewType => {
                                        const appliedFilter = this.state.appliedFilter;

                                        appliedFilter.viewType = viewType;

                                        setQueryParams(appliedFilter);

                                        this.setState({
                                            appliedFilter
                                        });
                                    }}
                                />
                            }
                        </div>
                        { this.state.isLoading &&
                            <Loader isLoading={true} />
                        }
                        { !this.state.isLoading &&
                        <div className="col-xs-12">
                                {
                                    this.state.offers.length === 0 &&
                                this.state.appliedFilter.viewType !== VIEW_TYPES.MAP &&
                                    <div
                                        className="text-center text-muted col-xs-12"
                                        style={{ marginBottom: 10} }
                                    >
                                            {translate('NO_LISTINGS')}
                                        <div className="row"><hr /></div>
                                    </div>
                                }

                                { this.state.appliedFilter.viewType === VIEW_TYPES.LIST &&
                                        this.state.offers.map(offer =>
                                            <div
                                                key={offer.id}
                                                className="col-xs-12"
                                                style={{ marginBottom: 10} }
                                            >
                                                <TaskListItem
                                                    task={offer}
                                                    displayPrice={true}
                                                />
                                                <div className="row"><hr /></div>
                                            </div>
                                        )
                                }
                                { this.state.appliedFilter.viewType === VIEW_TYPES.MAP &&
                                    <div className="row">
                                        <div
                                            style={{
                                                height: '400px',
                                                width: '100%'
                                            }}
                                        >
                                            {this.state.offers &&
                                                <TaskMap
                                                    country={CONFIG.LISTING_GEOFILTER_COUNTRY_RESTRICTION}
                                                    listings={this.state.offers}
                                                />
                                            }
                                        </div>
                                    </div>
                                }
                                {this.state.appliedFilter.viewType === VIEW_TYPES.GRID &&
                                    <div className="row visible-xs visible-sm" >
                                        { this.state.offersChunksXS &&
                                            this.state.offersChunksXS.map((offerRow, index) =>
                                                <div className="row" key={index}>
                                                    { this.state.offersChunksXS[index]
                                                        .map(offer =>
                                                            <div
                                                                key={offer.id}
                                                                className="col-xs-12 col-sm-6"
                                                                style={{ marginBottom: 20 } }
                                                            >
                                                                <TaskCard
                                                                    task={offer}
                                                                    displayDesc={true}
                                                                    displayPrice={true}
                                                                />
                                                            </div>
                                                        )
                                                    }
                                                </div>
                                        )}
                                    </div>
                                }
                                {this.state.appliedFilter.viewType === VIEW_TYPES.GRID &&
                                    <div className="row hidden-xs hidden-sm" >
                                        { this.state.offersChunksMD &&
                                            this.state.offersChunksMD.map((offerRow, index) =>
                                                <div className="row" key={index}>
                                                    { this.state.offersChunksMD[index].map(offer =>
                                                        <div
                                                            key={offer.id}
                                                            className="col-xs-12 col-sm-4 col-md-4"
                                                            style={{ marginBottom: 10 }}
                                                        >
                                                            <TaskCard
                                                                task={offer}
                                                                displayPrice={true}
                                                                displayDesc={true}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                        )}
                                    </div>
                                }
                            </div>
                        }
                    </div>
                </div>
            </div>
        );
    }
}

export default Offers;
