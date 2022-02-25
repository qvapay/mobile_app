

import 'package:mobile_app/core/widgets/list_tile_card_widget.dart';

class ListTileData {
  ListTileData(
      {required this.name,
      required this.avatar,
      required this.subtexto,
      required this.credit,
      required this.date,
      required this.active});

  final String name;
  final String avatar;
  final String subtexto;
  final String credit;
  final String date;
  final bool active;
}

class LisTileWidget {
  static List<ListTileCard> dataLisTile = [
    const ListTileCard(
        name: 'Anthony James Korsgaard',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'subtexto',
        credit: '',
        date: '',
        user: true),
    const ListTileCard(
        name: 'Aaron Ekstrom Bothman',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'aaron@gmail.com',
        credit: '',
        date: '',
        user: true),
    const ListTileCard(
        name: 'Brandon Schleifer',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'Crédito',
        credit: '542.23',
        date: '05/06/2021',
        user: true),
    const ListTileCard(
        name: 'Brandon Schleifer',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'Crédito',
        credit: '542.23',
        date: '05/06/2021',
        user: true),
    const ListTileCard(
        name: 'Brandon Schleifer',
        avatar: 'assets/avatars/keanu.png',
        subtexto: '@gmail.com',
        credit: '',
        date: '',
        user: true),
    const ListTileCard(
        name: 'Cameron Franci',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'Crédito',
        credit: '',
        date: '',
        user: true),
    const ListTileCard(
        name: 'Martin',
        avatar: 'assets/avatars/keanu.png',
        subtexto: '',
        credit: '',
        date: '',
        user: true),
  ];

  static List<ListTileData> dataLisTileData = [
    ListTileData(
        name: 'Anthony James Korsgaard',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'subtexto',
        credit: '',
        date: '',
        active: true),
    ListTileData(
        name: 'Aaron Ekstrom Bothman',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'subtexto',
        credit: '',
        date: '',
        active: true),
    ListTileData(
        name: 'Brandon Schleifer',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'subtexto',
        credit: '',
        date: '',
        active: true),
    ListTileData(
        name: 'Cameron Franci',
        avatar: 'assets/avatars/keanu.png',
        subtexto: 'subtexto',
        credit: '',
        date: '',
        active: true),
  ];
}
