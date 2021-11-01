import 'package:equatable/equatable.dart';

class LastLogIn extends Equatable {
  const LastLogIn({
    required this.name,
    required this.email,
    required this.photoUrl,
    required this.date,
  });

  factory LastLogIn.fromJson(Map<String, dynamic> map) {
    return LastLogIn(
      name: map['name'] as String,
      email: map['email'] as String,
      photoUrl: map['photoUrl'] as String,
      date: DateTime.parse(map['date'] as String),
    );
  }

  final String name;
  final String email;
  final String photoUrl;
  final DateTime date;

  LastLogIn copyWith({
    String? name,
    String? email,
    String? photoUrl,
    DateTime? date,
  }) {
    return LastLogIn(
      name: name ?? this.name,
      email: email ?? this.email,
      photoUrl: photoUrl ?? this.photoUrl,
      date: date ?? this.date,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'name': name,
      'email': email,
      'photoUrl': photoUrl,
      'date': date.toIso8601String(),
    };
  }

  @override
  bool get stringify => true;

  @override
  List<Object> get props => [name, email, photoUrl, date];
}
