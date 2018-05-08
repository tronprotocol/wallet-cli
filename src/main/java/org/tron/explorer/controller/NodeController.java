/*
 * java-tron is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * java-tron is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
package org.tron.explorer.controller;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.exception.GeoIp2Exception;
import com.maxmind.geoip2.model.CityResponse;
import com.maxmind.geoip2.record.City;
import com.maxmind.geoip2.record.Country;
import com.maxmind.geoip2.record.Location;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.Node;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.common.utils.ByteArray;
import org.tron.walletserver.WalletClient;

import java.io.*;
import java.net.InetAddress;
import java.util.*;

@RestController
public class NodeController {

  private static final Log log = LogFactory.getLog(NodeController.class);
  static final String splitString0 = "|||";
  static final String splitString1 = "\\|\\|\\|";
  private static Map<String, String> ipCity = loadCityMap();

  public static void addNewIp(String ip, Map ipCity) {
    String dbPath = WalletClient.getDbPath();
    String txtPath = WalletClient.getTxtPath();
    InputStream input = null;
    DatabaseReader reader = null;
    FileWriter fw = null;
    BufferedWriter bw = null;

    try {
      ClassPathResource classPathResource = new ClassPathResource(dbPath);
      input = classPathResource.getInputStream();
      reader = new DatabaseReader.Builder(input).build();
      InetAddress ipAddress = InetAddress.getByName(ip);
      if (ipAddress == null) {
        return;
      }
      CityResponse response = reader.city(ipAddress);

      Country country = response.getCountry();
      //    Subdivision subdivision = response.getMostSpecificSubdivision();
      City city = response.getCity();
      //    Postal postal = response.getPostal();
      Location location = response.getLocation();

      String countryName = null;
      String cityName = null;
      if (country != null) {
        countryName = country.getName();
      }
      if (city != null) {
        cityName = city.getName();
      }
      if (countryName == null && cityName != null) {
        countryName = cityName;
      }
      if (countryName != null && cityName == null) {
        cityName = countryName;
      }
      Double longitude = 0.0;
      Double latitude = 0.0;
      if (location != null) {
        longitude = location.getLongitude();
        latitude = location.getLatitude();
      }

      String jsonData = "\"country\":\"" + countryName + "\",";
      jsonData += "\"city\":\"" + cityName + "\",";
      jsonData += "\"longitude\":" + longitude + ",";
      jsonData += "\"latitude\":" + latitude;

      File txtFile = new File(txtPath);
      if (!txtFile.exists()) {
        txtFile.createNewFile();
      }
      fw = new FileWriter(txtFile, true);
      bw = new BufferedWriter(fw);
      bw.write(ip);
      bw.write(splitString0);
      bw.write(jsonData);
      bw.write("\n");
      ipCity.put(ip, jsonData);

    } catch (IOException ioEx) {
      log.error(ioEx.getMessage());
    } catch (GeoIp2Exception geoIp2Ex) {
      log.error(geoIp2Ex.getMessage());
    } finally {
      try {
        if (reader != null) {
          reader.close();
        }
        if (input != null) {
          input.close();
        }
        if (bw != null) {
          bw.close();
        }
        if (fw != null) {
          fw.close();
        }
      } catch (IOException e) {
        log.error(e.getMessage());
      }
    }
  }

  private static Map<String, String> loadCityMap() {
    Map<String, String> ipCity = new HashMap<String, String>();
    String txtPath = WalletClient.getTxtPath();
    FileReader fr = null;
    BufferedReader br = null;
    try {
      File txtFile = new File(txtPath);
      fr = new FileReader(txtFile);
      br = new BufferedReader(fr);
      String line = br.readLine();
      if (line == null) {
        return ipCity;
      }

      while (line != null) {
        String[] strings = line.split(splitString1);
        if (strings.length == 2) {
          ipCity.put(strings[0], strings[1]);
        }
        line = br.readLine();
      }
    } catch (IOException io) {
      log.error(io.getMessage());
    } finally {
      try {
        if (br != null) {
          br.close();
        }
        if (fr != null) {
          fr.close();
        }
      } catch (IOException e) {
        log.error(e.getMessage());
      }
    }
    return ipCity;
  }

  private static String Node2Json(Node node) throws IOException, GeoIp2Exception {
    String ip = ByteArray.toStr(node.getAddress().getHost().toByteArray());
    if (ipCity.containsKey(ip)) {
      return ipCity.get(ip);
    }
    addNewIp(ip, ipCity);
    if (ipCity.containsKey(ip)) {
      return ipCity.get(ip);
    }
    return "";
  }

  private static String NodeList2Json(NodeList nodeList) throws IOException, GeoIp2Exception {
    List<Node> listNode = nodeList.getNodesList();
    Map<String, Integer> cityCount = new HashMap<String, Integer>();
    for (int i = 0; i < listNode.size(); i++) {
      Node node = listNode.get(i);
      String nodeString = Node2Json(node);
      if (nodeString == null || nodeString.equals("")) {
        continue;
      }
      Integer count = 0;
      if (cityCount.containsKey(nodeString)) {
        count = cityCount.get(nodeString);
      }
      count++;
      cityCount.put(nodeString, count);
    }

    String nodes = "{\"citys\":[";  // + node0 + "," + node1 +

    Iterator iter = cityCount.entrySet().iterator();
    int j = 0;
    while (iter.hasNext()) {
      Map.Entry entry = (Map.Entry) iter.next();
      String nodeString = (String) entry.getKey();
      Integer count = (Integer) entry.getValue();
      nodeString = "{" + nodeString + ",\"count\":" + count + "}";
      if (j > 0) {
        nodes += ",";
      }
      nodes += nodeString;
      j++;
    }
    nodes += "]}";
    return nodes;
  }

  @GetMapping("/nodeList")
  /**
   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
   */
  public String getNodeList() {
    try {
      Optional<NodeList> result = WalletClient.listNodes();
      if (result.isPresent()) {
        NodeList nodeList = result.get();
        return NodeList2Json(nodeList);
      }
    } catch (Exception e) {
      log.error(e.getMessage());
    }
    return "";
  }
}