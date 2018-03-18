/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -25200000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -25200000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 221762.0, "minX": 0.0, "maxY": 276691.0, "series": [{"data": [[0.0, 221762.0], [0.1, 221762.0], [0.2, 221762.0], [0.3, 221762.0], [0.4, 221762.0], [0.5, 221762.0], [0.6, 221762.0], [0.7, 221762.0], [0.8, 221762.0], [0.9, 224282.0], [1.0, 224282.0], [1.1, 224282.0], [1.2, 224282.0], [1.3, 224282.0], [1.4, 224282.0], [1.5, 224282.0], [1.6, 224282.0], [1.7, 224465.0], [1.8, 224465.0], [1.9, 224465.0], [2.0, 224465.0], [2.1, 224465.0], [2.2, 224465.0], [2.3, 224465.0], [2.4, 224465.0], [2.5, 225638.0], [2.6, 225638.0], [2.7, 225638.0], [2.8, 225638.0], [2.9, 225638.0], [3.0, 225638.0], [3.1, 225638.0], [3.2, 225638.0], [3.3, 225638.0], [3.4, 225784.0], [3.5, 225784.0], [3.6, 225784.0], [3.7, 225784.0], [3.8, 225784.0], [3.9, 225784.0], [4.0, 225784.0], [4.1, 225784.0], [4.2, 227802.0], [4.3, 227802.0], [4.4, 227802.0], [4.5, 227802.0], [4.6, 227802.0], [4.7, 227802.0], [4.8, 227802.0], [4.9, 227802.0], [5.0, 227836.0], [5.1, 227836.0], [5.2, 227836.0], [5.3, 227836.0], [5.4, 227836.0], [5.5, 227836.0], [5.6, 227836.0], [5.7, 227836.0], [5.8, 227836.0], [5.9, 228700.0], [6.0, 228700.0], [6.1, 228700.0], [6.2, 228700.0], [6.3, 228700.0], [6.4, 228700.0], [6.5, 228700.0], [6.6, 228700.0], [6.7, 229059.0], [6.8, 229059.0], [6.9, 229059.0], [7.0, 229059.0], [7.1, 229059.0], [7.2, 229059.0], [7.3, 229059.0], [7.4, 229059.0], [7.5, 229101.0], [7.6, 229101.0], [7.7, 229101.0], [7.8, 229101.0], [7.9, 229101.0], [8.0, 229101.0], [8.1, 229101.0], [8.2, 229101.0], [8.3, 229101.0], [8.4, 229759.0], [8.5, 229759.0], [8.6, 229759.0], [8.7, 229759.0], [8.8, 229759.0], [8.9, 229759.0], [9.0, 229759.0], [9.1, 229759.0], [9.2, 230419.0], [9.3, 230419.0], [9.4, 230419.0], [9.5, 230419.0], [9.6, 230419.0], [9.7, 230419.0], [9.8, 230419.0], [9.9, 230419.0], [10.0, 230480.0], [10.1, 230480.0], [10.2, 230480.0], [10.3, 230480.0], [10.4, 230480.0], [10.5, 230480.0], [10.6, 230480.0], [10.7, 230480.0], [10.8, 230480.0], [10.9, 230577.0], [11.0, 230577.0], [11.1, 230577.0], [11.2, 230577.0], [11.3, 230577.0], [11.4, 230577.0], [11.5, 230577.0], [11.6, 230577.0], [11.7, 230583.0], [11.8, 230583.0], [11.9, 230583.0], [12.0, 230583.0], [12.1, 230583.0], [12.2, 230583.0], [12.3, 230583.0], [12.4, 230583.0], [12.5, 230583.0], [12.6, 230585.0], [12.7, 230585.0], [12.8, 230585.0], [12.9, 230585.0], [13.0, 230585.0], [13.1, 230585.0], [13.2, 230585.0], [13.3, 230585.0], [13.4, 230758.0], [13.5, 230758.0], [13.6, 230758.0], [13.7, 230758.0], [13.8, 230758.0], [13.9, 230758.0], [14.0, 230758.0], [14.1, 230758.0], [14.2, 230887.0], [14.3, 230887.0], [14.4, 230887.0], [14.5, 230887.0], [14.6, 230887.0], [14.7, 230887.0], [14.8, 230887.0], [14.9, 230887.0], [15.0, 230887.0], [15.1, 230895.0], [15.2, 230895.0], [15.3, 230895.0], [15.4, 230895.0], [15.5, 230895.0], [15.6, 230895.0], [15.7, 230895.0], [15.8, 230895.0], [15.9, 230922.0], [16.0, 230922.0], [16.1, 230922.0], [16.2, 230922.0], [16.3, 230922.0], [16.4, 230922.0], [16.5, 230922.0], [16.6, 230922.0], [16.7, 230985.0], [16.8, 230985.0], [16.9, 230985.0], [17.0, 230985.0], [17.1, 230985.0], [17.2, 230985.0], [17.3, 230985.0], [17.4, 230985.0], [17.5, 230985.0], [17.6, 231035.0], [17.7, 231035.0], [17.8, 231035.0], [17.9, 231035.0], [18.0, 231035.0], [18.1, 231035.0], [18.2, 231035.0], [18.3, 231035.0], [18.4, 231382.0], [18.5, 231382.0], [18.6, 231382.0], [18.7, 231382.0], [18.8, 231382.0], [18.9, 231382.0], [19.0, 231382.0], [19.1, 231382.0], [19.2, 231498.0], [19.3, 231498.0], [19.4, 231498.0], [19.5, 231498.0], [19.6, 231498.0], [19.7, 231498.0], [19.8, 231498.0], [19.9, 231498.0], [20.0, 231554.0], [20.1, 231554.0], [20.2, 231554.0], [20.3, 231554.0], [20.4, 231554.0], [20.5, 231554.0], [20.6, 231554.0], [20.7, 231554.0], [20.8, 231554.0], [20.9, 231759.0], [21.0, 231759.0], [21.1, 231759.0], [21.2, 231759.0], [21.3, 231759.0], [21.4, 231759.0], [21.5, 231759.0], [21.6, 231759.0], [21.7, 232016.0], [21.8, 232016.0], [21.9, 232016.0], [22.0, 232016.0], [22.1, 232016.0], [22.2, 232016.0], [22.3, 232016.0], [22.4, 232016.0], [22.5, 232217.0], [22.6, 232217.0], [22.7, 232217.0], [22.8, 232217.0], [22.9, 232217.0], [23.0, 232217.0], [23.1, 232217.0], [23.2, 232217.0], [23.3, 232217.0], [23.4, 232297.0], [23.5, 232297.0], [23.6, 232297.0], [23.7, 232297.0], [23.8, 232297.0], [23.9, 232297.0], [24.0, 232297.0], [24.1, 232297.0], [24.2, 232346.0], [24.3, 232346.0], [24.4, 232346.0], [24.5, 232346.0], [24.6, 232346.0], [24.7, 232346.0], [24.8, 232346.0], [24.9, 232346.0], [25.0, 232541.0], [25.1, 232541.0], [25.2, 232541.0], [25.3, 232541.0], [25.4, 232541.0], [25.5, 232541.0], [25.6, 232541.0], [25.7, 232541.0], [25.8, 232541.0], [25.9, 232588.0], [26.0, 232588.0], [26.1, 232588.0], [26.2, 232588.0], [26.3, 232588.0], [26.4, 232588.0], [26.5, 232588.0], [26.6, 232588.0], [26.7, 232685.0], [26.8, 232685.0], [26.9, 232685.0], [27.0, 232685.0], [27.1, 232685.0], [27.2, 232685.0], [27.3, 232685.0], [27.4, 232685.0], [27.5, 232733.0], [27.6, 232733.0], [27.7, 232733.0], [27.8, 232733.0], [27.9, 232733.0], [28.0, 232733.0], [28.1, 232733.0], [28.2, 232733.0], [28.3, 232733.0], [28.4, 232954.0], [28.5, 232954.0], [28.6, 232954.0], [28.7, 232954.0], [28.8, 232954.0], [28.9, 232954.0], [29.0, 232954.0], [29.1, 232954.0], [29.2, 233013.0], [29.3, 233013.0], [29.4, 233013.0], [29.5, 233013.0], [29.6, 233013.0], [29.7, 233013.0], [29.8, 233013.0], [29.9, 233013.0], [30.0, 233416.0], [30.1, 233416.0], [30.2, 233416.0], [30.3, 233416.0], [30.4, 233416.0], [30.5, 233416.0], [30.6, 233416.0], [30.7, 233416.0], [30.8, 233416.0], [30.9, 233423.0], [31.0, 233423.0], [31.1, 233423.0], [31.2, 233423.0], [31.3, 233423.0], [31.4, 233423.0], [31.5, 233423.0], [31.6, 233423.0], [31.7, 233455.0], [31.8, 233455.0], [31.9, 233455.0], [32.0, 233455.0], [32.1, 233455.0], [32.2, 233455.0], [32.3, 233455.0], [32.4, 233455.0], [32.5, 233486.0], [32.6, 233486.0], [32.7, 233486.0], [32.8, 233486.0], [32.9, 233486.0], [33.0, 233486.0], [33.1, 233486.0], [33.2, 233486.0], [33.3, 233486.0], [33.4, 233575.0], [33.5, 233575.0], [33.6, 233575.0], [33.7, 233575.0], [33.8, 233575.0], [33.9, 233575.0], [34.0, 233575.0], [34.1, 233575.0], [34.2, 233655.0], [34.3, 233655.0], [34.4, 233655.0], [34.5, 233655.0], [34.6, 233655.0], [34.7, 233655.0], [34.8, 233655.0], [34.9, 233655.0], [35.0, 233720.0], [35.1, 233720.0], [35.2, 233720.0], [35.3, 233720.0], [35.4, 233720.0], [35.5, 233720.0], [35.6, 233720.0], [35.7, 233720.0], [35.8, 233720.0], [35.9, 233919.0], [36.0, 233919.0], [36.1, 233919.0], [36.2, 233919.0], [36.3, 233919.0], [36.4, 233919.0], [36.5, 233919.0], [36.6, 233919.0], [36.7, 233977.0], [36.8, 233977.0], [36.9, 233977.0], [37.0, 233977.0], [37.1, 233977.0], [37.2, 233977.0], [37.3, 233977.0], [37.4, 233977.0], [37.5, 233995.0], [37.6, 233995.0], [37.7, 233995.0], [37.8, 233995.0], [37.9, 233995.0], [38.0, 233995.0], [38.1, 233995.0], [38.2, 233995.0], [38.3, 233995.0], [38.4, 234117.0], [38.5, 234117.0], [38.6, 234117.0], [38.7, 234117.0], [38.8, 234117.0], [38.9, 234117.0], [39.0, 234117.0], [39.1, 234117.0], [39.2, 234647.0], [39.3, 234647.0], [39.4, 234647.0], [39.5, 234647.0], [39.6, 234647.0], [39.7, 234647.0], [39.8, 234647.0], [39.9, 234647.0], [40.0, 234647.0], [40.1, 234747.0], [40.2, 234747.0], [40.3, 234747.0], [40.4, 234747.0], [40.5, 234747.0], [40.6, 234747.0], [40.7, 234747.0], [40.8, 234747.0], [40.9, 234942.0], [41.0, 234942.0], [41.1, 234942.0], [41.2, 234942.0], [41.3, 234942.0], [41.4, 234942.0], [41.5, 234942.0], [41.6, 234942.0], [41.7, 235617.0], [41.8, 235617.0], [41.9, 235617.0], [42.0, 235617.0], [42.1, 235617.0], [42.2, 235617.0], [42.3, 235617.0], [42.4, 235617.0], [42.5, 235617.0], [42.6, 236000.0], [42.7, 236000.0], [42.8, 236000.0], [42.9, 236000.0], [43.0, 236000.0], [43.1, 236000.0], [43.2, 236000.0], [43.3, 236000.0], [43.4, 236297.0], [43.5, 236297.0], [43.6, 236297.0], [43.7, 236297.0], [43.8, 236297.0], [43.9, 236297.0], [44.0, 236297.0], [44.1, 236297.0], [44.2, 236664.0], [44.3, 236664.0], [44.4, 236664.0], [44.5, 236664.0], [44.6, 236664.0], [44.7, 236664.0], [44.8, 236664.0], [44.9, 236664.0], [45.0, 236664.0], [45.1, 236969.0], [45.2, 236969.0], [45.3, 236969.0], [45.4, 236969.0], [45.5, 236969.0], [45.6, 236969.0], [45.7, 236969.0], [45.8, 236969.0], [45.9, 237187.0], [46.0, 237187.0], [46.1, 237187.0], [46.2, 237187.0], [46.3, 237187.0], [46.4, 237187.0], [46.5, 237187.0], [46.6, 237187.0], [46.7, 237700.0], [46.8, 237700.0], [46.9, 237700.0], [47.0, 237700.0], [47.1, 237700.0], [47.2, 237700.0], [47.3, 237700.0], [47.4, 237700.0], [47.5, 237700.0], [47.6, 238398.0], [47.7, 238398.0], [47.8, 238398.0], [47.9, 238398.0], [48.0, 238398.0], [48.1, 238398.0], [48.2, 238398.0], [48.3, 238398.0], [48.4, 240909.0], [48.5, 240909.0], [48.6, 240909.0], [48.7, 240909.0], [48.8, 240909.0], [48.9, 240909.0], [49.0, 240909.0], [49.1, 240909.0], [49.2, 244231.0], [49.3, 244231.0], [49.4, 244231.0], [49.5, 244231.0], [49.6, 244231.0], [49.7, 244231.0], [49.8, 244231.0], [49.9, 244231.0], [50.0, 244231.0], [50.1, 262993.0], [50.2, 262993.0], [50.3, 262993.0], [50.4, 262993.0], [50.5, 262993.0], [50.6, 262993.0], [50.7, 262993.0], [50.8, 262993.0], [50.9, 265054.0], [51.0, 265054.0], [51.1, 265054.0], [51.2, 265054.0], [51.3, 265054.0], [51.4, 265054.0], [51.5, 265054.0], [51.6, 265054.0], [51.7, 265415.0], [51.8, 265415.0], [51.9, 265415.0], [52.0, 265415.0], [52.1, 265415.0], [52.2, 265415.0], [52.3, 265415.0], [52.4, 265415.0], [52.5, 265415.0], [52.6, 265497.0], [52.7, 265497.0], [52.8, 265497.0], [52.9, 265497.0], [53.0, 265497.0], [53.1, 265497.0], [53.2, 265497.0], [53.3, 265497.0], [53.4, 266010.0], [53.5, 266010.0], [53.6, 266010.0], [53.7, 266010.0], [53.8, 266010.0], [53.9, 266010.0], [54.0, 266010.0], [54.1, 266010.0], [54.2, 266015.0], [54.3, 266015.0], [54.4, 266015.0], [54.5, 266015.0], [54.6, 266015.0], [54.7, 266015.0], [54.8, 266015.0], [54.9, 266015.0], [55.0, 266015.0], [55.1, 266042.0], [55.2, 266042.0], [55.3, 266042.0], [55.4, 266042.0], [55.5, 266042.0], [55.6, 266042.0], [55.7, 266042.0], [55.8, 266042.0], [55.9, 266224.0], [56.0, 266224.0], [56.1, 266224.0], [56.2, 266224.0], [56.3, 266224.0], [56.4, 266224.0], [56.5, 266224.0], [56.6, 266224.0], [56.7, 266237.0], [56.8, 266237.0], [56.9, 266237.0], [57.0, 266237.0], [57.1, 266237.0], [57.2, 266237.0], [57.3, 266237.0], [57.4, 266237.0], [57.5, 266237.0], [57.6, 266336.0], [57.7, 266336.0], [57.8, 266336.0], [57.9, 266336.0], [58.0, 266336.0], [58.1, 266336.0], [58.2, 266336.0], [58.3, 266336.0], [58.4, 266359.0], [58.5, 266359.0], [58.6, 266359.0], [58.7, 266359.0], [58.8, 266359.0], [58.9, 266359.0], [59.0, 266359.0], [59.1, 266359.0], [59.2, 266546.0], [59.3, 266546.0], [59.4, 266546.0], [59.5, 266546.0], [59.6, 266546.0], [59.7, 266546.0], [59.8, 266546.0], [59.9, 266546.0], [60.0, 266546.0], [60.1, 266553.0], [60.2, 266553.0], [60.3, 266553.0], [60.4, 266553.0], [60.5, 266553.0], [60.6, 266553.0], [60.7, 266553.0], [60.8, 266553.0], [60.9, 266573.0], [61.0, 266573.0], [61.1, 266573.0], [61.2, 266573.0], [61.3, 266573.0], [61.4, 266573.0], [61.5, 266573.0], [61.6, 266573.0], [61.7, 267170.0], [61.8, 267170.0], [61.9, 267170.0], [62.0, 267170.0], [62.1, 267170.0], [62.2, 267170.0], [62.3, 267170.0], [62.4, 267170.0], [62.5, 267170.0], [62.6, 267427.0], [62.7, 267427.0], [62.8, 267427.0], [62.9, 267427.0], [63.0, 267427.0], [63.1, 267427.0], [63.2, 267427.0], [63.3, 267427.0], [63.4, 267462.0], [63.5, 267462.0], [63.6, 267462.0], [63.7, 267462.0], [63.8, 267462.0], [63.9, 267462.0], [64.0, 267462.0], [64.1, 267462.0], [64.2, 267613.0], [64.3, 267613.0], [64.4, 267613.0], [64.5, 267613.0], [64.6, 267613.0], [64.7, 267613.0], [64.8, 267613.0], [64.9, 267613.0], [65.0, 267613.0], [65.1, 267632.0], [65.2, 267632.0], [65.3, 267632.0], [65.4, 267632.0], [65.5, 267632.0], [65.6, 267632.0], [65.7, 267632.0], [65.8, 267632.0], [65.9, 267796.0], [66.0, 267796.0], [66.1, 267796.0], [66.2, 267796.0], [66.3, 267796.0], [66.4, 267796.0], [66.5, 267796.0], [66.6, 267796.0], [66.7, 267897.0], [66.8, 267897.0], [66.9, 267897.0], [67.0, 267897.0], [67.1, 267897.0], [67.2, 267897.0], [67.3, 267897.0], [67.4, 267897.0], [67.5, 267897.0], [67.6, 268006.0], [67.7, 268006.0], [67.8, 268006.0], [67.9, 268006.0], [68.0, 268006.0], [68.1, 268006.0], [68.2, 268006.0], [68.3, 268006.0], [68.4, 268065.0], [68.5, 268065.0], [68.6, 268065.0], [68.7, 268065.0], [68.8, 268065.0], [68.9, 268065.0], [69.0, 268065.0], [69.1, 268065.0], [69.2, 268112.0], [69.3, 268112.0], [69.4, 268112.0], [69.5, 268112.0], [69.6, 268112.0], [69.7, 268112.0], [69.8, 268112.0], [69.9, 268112.0], [70.0, 268112.0], [70.1, 268127.0], [70.2, 268127.0], [70.3, 268127.0], [70.4, 268127.0], [70.5, 268127.0], [70.6, 268127.0], [70.7, 268127.0], [70.8, 268127.0], [70.9, 268158.0], [71.0, 268158.0], [71.1, 268158.0], [71.2, 268158.0], [71.3, 268158.0], [71.4, 268158.0], [71.5, 268158.0], [71.6, 268158.0], [71.7, 268246.0], [71.8, 268246.0], [71.9, 268246.0], [72.0, 268246.0], [72.1, 268246.0], [72.2, 268246.0], [72.3, 268246.0], [72.4, 268246.0], [72.5, 268246.0], [72.6, 268517.0], [72.7, 268517.0], [72.8, 268517.0], [72.9, 268517.0], [73.0, 268517.0], [73.1, 268517.0], [73.2, 268517.0], [73.3, 268517.0], [73.4, 268531.0], [73.5, 268531.0], [73.6, 268531.0], [73.7, 268531.0], [73.8, 268531.0], [73.9, 268531.0], [74.0, 268531.0], [74.1, 268531.0], [74.2, 268581.0], [74.3, 268581.0], [74.4, 268581.0], [74.5, 268581.0], [74.6, 268581.0], [74.7, 268581.0], [74.8, 268581.0], [74.9, 268581.0], [75.0, 268581.0], [75.1, 268765.0], [75.2, 268765.0], [75.3, 268765.0], [75.4, 268765.0], [75.5, 268765.0], [75.6, 268765.0], [75.7, 268765.0], [75.8, 268765.0], [75.9, 268779.0], [76.0, 268779.0], [76.1, 268779.0], [76.2, 268779.0], [76.3, 268779.0], [76.4, 268779.0], [76.5, 268779.0], [76.6, 268779.0], [76.7, 268842.0], [76.8, 268842.0], [76.9, 268842.0], [77.0, 268842.0], [77.1, 268842.0], [77.2, 268842.0], [77.3, 268842.0], [77.4, 268842.0], [77.5, 269167.0], [77.6, 269167.0], [77.7, 269167.0], [77.8, 269167.0], [77.9, 269167.0], [78.0, 269167.0], [78.1, 269167.0], [78.2, 269167.0], [78.3, 269167.0], [78.4, 269187.0], [78.5, 269187.0], [78.6, 269187.0], [78.7, 269187.0], [78.8, 269187.0], [78.9, 269187.0], [79.0, 269187.0], [79.1, 269187.0], [79.2, 269188.0], [79.3, 269188.0], [79.4, 269188.0], [79.5, 269188.0], [79.6, 269188.0], [79.7, 269188.0], [79.8, 269188.0], [79.9, 269188.0], [80.0, 269201.0], [80.1, 269201.0], [80.2, 269201.0], [80.3, 269201.0], [80.4, 269201.0], [80.5, 269201.0], [80.6, 269201.0], [80.7, 269201.0], [80.8, 269201.0], [80.9, 269268.0], [81.0, 269268.0], [81.1, 269268.0], [81.2, 269268.0], [81.3, 269268.0], [81.4, 269268.0], [81.5, 269268.0], [81.6, 269268.0], [81.7, 269289.0], [81.8, 269289.0], [81.9, 269289.0], [82.0, 269289.0], [82.1, 269289.0], [82.2, 269289.0], [82.3, 269289.0], [82.4, 269289.0], [82.5, 269393.0], [82.6, 269393.0], [82.7, 269393.0], [82.8, 269393.0], [82.9, 269393.0], [83.0, 269393.0], [83.1, 269393.0], [83.2, 269393.0], [83.3, 269393.0], [83.4, 269586.0], [83.5, 269586.0], [83.6, 269586.0], [83.7, 269586.0], [83.8, 269586.0], [83.9, 269586.0], [84.0, 269586.0], [84.1, 269586.0], [84.2, 269620.0], [84.3, 269620.0], [84.4, 269620.0], [84.5, 269620.0], [84.6, 269620.0], [84.7, 269620.0], [84.8, 269620.0], [84.9, 269620.0], [85.0, 269667.0], [85.1, 269667.0], [85.2, 269667.0], [85.3, 269667.0], [85.4, 269667.0], [85.5, 269667.0], [85.6, 269667.0], [85.7, 269667.0], [85.8, 269667.0], [85.9, 269743.0], [86.0, 269743.0], [86.1, 269743.0], [86.2, 269743.0], [86.3, 269743.0], [86.4, 269743.0], [86.5, 269743.0], [86.6, 269743.0], [86.7, 269843.0], [86.8, 269843.0], [86.9, 269843.0], [87.0, 269843.0], [87.1, 269843.0], [87.2, 269843.0], [87.3, 269843.0], [87.4, 269843.0], [87.5, 270074.0], [87.6, 270074.0], [87.7, 270074.0], [87.8, 270074.0], [87.9, 270074.0], [88.0, 270074.0], [88.1, 270074.0], [88.2, 270074.0], [88.3, 270074.0], [88.4, 270076.0], [88.5, 270076.0], [88.6, 270076.0], [88.7, 270076.0], [88.8, 270076.0], [88.9, 270076.0], [89.0, 270076.0], [89.1, 270076.0], [89.2, 270298.0], [89.3, 270298.0], [89.4, 270298.0], [89.5, 270298.0], [89.6, 270298.0], [89.7, 270298.0], [89.8, 270298.0], [89.9, 270298.0], [90.0, 270489.0], [90.1, 270489.0], [90.2, 270489.0], [90.3, 270489.0], [90.4, 270489.0], [90.5, 270489.0], [90.6, 270489.0], [90.7, 270489.0], [90.8, 270489.0], [90.9, 270496.0], [91.0, 270496.0], [91.1, 270496.0], [91.2, 270496.0], [91.3, 270496.0], [91.4, 270496.0], [91.5, 270496.0], [91.6, 270496.0], [91.7, 270980.0], [91.8, 270980.0], [91.9, 270980.0], [92.0, 270980.0], [92.1, 270980.0], [92.2, 270980.0], [92.3, 270980.0], [92.4, 270980.0], [92.5, 271026.0], [92.6, 271026.0], [92.7, 271026.0], [92.8, 271026.0], [92.9, 271026.0], [93.0, 271026.0], [93.1, 271026.0], [93.2, 271026.0], [93.3, 271026.0], [93.4, 271179.0], [93.5, 271179.0], [93.6, 271179.0], [93.7, 271179.0], [93.8, 271179.0], [93.9, 271179.0], [94.0, 271179.0], [94.1, 271179.0], [94.2, 271422.0], [94.3, 271422.0], [94.4, 271422.0], [94.5, 271422.0], [94.6, 271422.0], [94.7, 271422.0], [94.8, 271422.0], [94.9, 271422.0], [95.0, 271563.0], [95.1, 271563.0], [95.2, 271563.0], [95.3, 271563.0], [95.4, 271563.0], [95.5, 271563.0], [95.6, 271563.0], [95.7, 271563.0], [95.8, 271563.0], [95.9, 271915.0], [96.0, 271915.0], [96.1, 271915.0], [96.2, 271915.0], [96.3, 271915.0], [96.4, 271915.0], [96.5, 271915.0], [96.6, 271915.0], [96.7, 272237.0], [96.8, 272237.0], [96.9, 272237.0], [97.0, 272237.0], [97.1, 272237.0], [97.2, 272237.0], [97.3, 272237.0], [97.4, 272237.0], [97.5, 272761.0], [97.6, 272761.0], [97.7, 272761.0], [97.8, 272761.0], [97.9, 272761.0], [98.0, 272761.0], [98.1, 272761.0], [98.2, 272761.0], [98.3, 272761.0], [98.4, 273490.0], [98.5, 273490.0], [98.6, 273490.0], [98.7, 273490.0], [98.8, 273490.0], [98.9, 273490.0], [99.0, 273490.0], [99.1, 273490.0], [99.2, 276691.0], [99.3, 276691.0], [99.4, 276691.0], [99.5, 276691.0], [99.6, 276691.0], [99.7, 276691.0], [99.8, 276691.0], [99.9, 276691.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 221700.0, "maxY": 4.0, "series": [{"data": [[269700.0, 1.0], [266500.0, 3.0], [268100.0, 3.0], [224400.0, 1.0], [225600.0, 1.0], [230800.0, 2.0], [233600.0, 1.0], [236000.0, 1.0], [230400.0, 2.0], [235600.0, 1.0], [232000.0, 1.0], [268000.0, 2.0], [268800.0, 1.0], [270400.0, 2.0], [269600.0, 2.0], [269100.0, 3.0], [271500.0, 1.0], [221700.0, 1.0], [225700.0, 1.0], [231300.0, 1.0], [230500.0, 3.0], [232500.0, 2.0], [232900.0, 1.0], [231700.0, 1.0], [233700.0, 1.0], [234100.0, 1.0], [234900.0, 1.0], [236900.0, 1.0], [230900.0, 2.0], [229700.0, 1.0], [237700.0, 1.0], [240900.0, 1.0], [271400.0, 1.0], [272200.0, 1.0], [267400.0, 2.0], [265000.0, 1.0], [268200.0, 1.0], [269800.0, 1.0], [270900.0, 1.0], [268500.0, 3.0], [269300.0, 1.0], [262900.0, 1.0], [267700.0, 1.0], [224200.0, 1.0], [227800.0, 2.0], [229000.0, 1.0], [231000.0, 1.0], [233000.0, 1.0], [232200.0, 2.0], [234600.0, 1.0], [236200.0, 1.0], [236600.0, 1.0], [233400.0, 4.0], [231400.0, 1.0], [232600.0, 1.0], [244200.0, 1.0], [269200.0, 3.0], [266000.0, 3.0], [270000.0, 2.0], [267600.0, 2.0], [271100.0, 1.0], [268700.0, 2.0], [272700.0, 1.0], [269500.0, 1.0], [267100.0, 1.0], [271900.0, 1.0], [266300.0, 2.0], [228700.0, 1.0], [229100.0, 1.0], [237100.0, 1.0], [231500.0, 1.0], [232700.0, 1.0], [232300.0, 1.0], [234700.0, 1.0], [233900.0, 3.0], [233500.0, 1.0], [230700.0, 1.0], [238300.0, 1.0], [273400.0, 1.0], [265400.0, 2.0], [271000.0, 1.0], [270200.0, 1.0], [267800.0, 1.0], [266200.0, 2.0], [276600.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 276600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 120.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 120.0, "series": [{"data": [[2.0, 120.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 27.094339622641513, "minX": 1.52081328E12, "maxY": 60.0, "series": [{"data": [[1.52081358E12, 27.094339622641513], [1.52081352E12, 57.0], [1.52081328E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081358E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 232956.80327868852, "minX": 1.0, "maxY": 276691.0, "series": [{"data": [[2.0, 267796.0], [3.0, 269167.0], [4.0, 276691.0], [5.0, 262993.0], [6.0, 266224.0], [7.0, 266336.0], [8.0, 266237.0], [9.0, 266359.0], [10.0, 266042.0], [11.0, 266015.0], [12.0, 267632.0], [13.0, 269843.0], [14.0, 267427.0], [15.0, 269667.0], [16.0, 267613.0], [17.0, 270076.0], [18.0, 268517.0], [20.0, 268179.0], [21.0, 268127.0], [23.0, 269444.0], [24.0, 266573.0], [25.0, 271915.0], [26.0, 267170.0], [27.0, 270074.0], [28.0, 267897.0], [29.0, 268158.0], [30.0, 270496.0], [31.0, 266546.0], [35.0, 269187.0], [34.0, 268543.3333333333], [37.0, 268581.0], [36.0, 265054.0], [39.0, 270489.0], [38.0, 266010.0], [41.0, 269201.0], [40.0, 271026.0], [43.0, 271563.0], [42.0, 269586.0], [45.0, 269289.0], [44.0, 269393.0], [47.0, 269188.0], [46.0, 268842.0], [49.0, 268006.0], [48.0, 272761.0], [51.0, 267462.0], [50.0, 268765.0], [53.0, 268065.0], [52.0, 265415.0], [55.0, 273490.0], [54.0, 271179.0], [57.0, 268531.0], [56.0, 272237.0], [59.0, 269743.0], [58.0, 270980.0], [60.0, 232956.80327868852], [1.0, 265497.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.29166666666667, 250519.7666666666]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 14.816666666666666, "minX": 1.52081328E12, "maxY": 43293.0, "series": [{"data": [[1.52081358E12, 38242.15], [1.52081352E12, 5050.85], [1.52081328E12, 43293.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52081358E12, 112.18333333333334], [1.52081352E12, 14.816666666666666], [1.52081328E12, 127.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081358E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 232315.71666666665, "minX": 1.52081328E12, "maxY": 271083.14285714284, "series": [{"data": [[1.52081358E12, 268412.2075471698], [1.52081352E12, 271083.14285714284], [1.52081328E12, 232315.71666666665]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081358E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 40080.13333333334, "minX": 1.52081328E12, "maxY": 106475.7924528302, "series": [{"data": [[1.52081358E12, 106475.7924528302], [1.52081352E12, 105694.85714285714], [1.52081328E12, 40080.13333333334]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081358E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 7.2857142857142865, "minX": 1.52081328E12, "maxY": 9.399999999999997, "series": [{"data": [[1.52081358E12, 7.849056603773585], [1.52081352E12, 7.2857142857142865], [1.52081328E12, 9.399999999999997]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081358E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 221762.0, "minX": 1.52081328E12, "maxY": 276691.0, "series": [{"data": [[1.52081358E12, 276691.0], [1.52081352E12, 273490.0], [1.52081328E12, 244231.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52081358E12, 262993.0], [1.52081352E12, 268531.0], [1.52081328E12, 221762.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52081358E12, 270469.9], [1.52081352E12, 268773.4], [1.52081328E12, 236938.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52081358E12, 276018.79], [1.52081352E12, 273490.0], [1.52081328E12, 244231.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52081358E12, 271555.95], [1.52081352E12, 271324.8], [1.52081328E12, 238363.1]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081358E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 232443.5, "minX": 0.0, "maxY": 268673.0, "series": [{"data": [[1.0, 232443.5], [0.0, 268673.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 41017.0, "minX": 0.0, "maxY": 106391.5, "series": [{"data": [[1.0, 41017.0], [0.0, 106391.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.52081304E12, "maxY": 1.0, "series": [{"data": [[1.52081304E12, 1.0], [1.52081328E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081328E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.11666666666666667, "minX": 1.52081328E12, "maxY": 1.0, "series": [{"data": [[1.52081358E12, 0.8833333333333333], [1.52081352E12, 0.11666666666666667], [1.52081328E12, 1.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081358E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.11666666666666667, "minX": 1.52081328E12, "maxY": 1.0, "series": [{"data": [[1.52081358E12, 0.8833333333333333], [1.52081352E12, 0.11666666666666667], [1.52081328E12, 1.0]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081358E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
