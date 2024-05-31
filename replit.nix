{ pkgs }: {
	deps = [
		pkgs.ffmpeg.bin
  pkgs.haskellPackages.hinit
  pkgs.sudo
  pkgs.nodejs-18_x
    pkgs.nodePackages.typescript-language-server
    pkgs.yarn
    pkgs.replitPackages.jest
	];
}