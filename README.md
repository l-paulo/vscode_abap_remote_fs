# ABAP remote filesystem for visual studio code

Ideally one day this will allow you to edit your ABAP code directly in Visual studio code
Very early stages, for now it only displays some packages and a handful of object types, no local objects,subroutines in object lists...

Even things that do work need a big refactor
![image](https://user-images.githubusercontent.com/2453277/47466602-dd99dc00-d7e9-11e8-97ed-28e23dfd8f90.png)
syntax highlighting added manually with the [ABAP language extension](https://marketplace.visualstudio.com/items?itemName=larshp.vscode-abap),picture was too lame without it :)

## Features

Connect to your SAP server using the ADT interface

## setup

You will need connection details in your settings:

```json
  "abapfs.remote": {
    "NPL": {
      "url": "http://vhcalnplci.bti.local:8000",
      "username": "developer",
      "password": "secret"
    }
  }
```

## License

MIT license applies
